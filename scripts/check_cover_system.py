#!/usr/bin/env python3
"""Regression checks for generated covers and editable masters; no static writes.

Run after generate_og_cards.py. Requires only the generator's Pillow / PyYAML
dependencies; PPTX inspection uses the standard-library ZIP and XML readers.
This checks artifact structure and title preservation, not visual acceptance.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from PIL import Image, ImageDraw

import generate_og_cards as og


NS = {
    "s": "http://www.w3.org/2000/svg",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
BRANDING = og.ROOT / "static" / "branding"


def require(condition: object, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def compact(text: str) -> str:
    return re.sub(r"\s+", "", text)


def check_masters() -> tuple[dict, list[list[str]]]:
    spec = json.loads((BRANDING / "cover-system.json").read_text(encoding="utf-8"))
    canvas, title = spec["canvas"], spec["layout"]["title"]
    require((canvas["width"], canvas["height"]) == (og.WIDTH, og.HEIGHT), "Spec/generator canvas mismatch")
    require(spec["palette"]["paper"] == og.PAPER and spec["palette"]["ink"] == og.INK
            and spec["palette"]["accent"] == og.BLUE, "Spec/generator palette mismatch")
    require(title["maximum_lines"] == 3 and title["no_ellipsis"] is True, "Complete three-line title rule missing")
    require(title["text_only_width"] > title["illustrated_width"], "Long-title full-width fallback missing")
    require(0.15 <= spec["layout"]["motif"]["canvas_fraction"] <= 0.25, "Motif region must occupy 15–25%")
    require([t["id"] for t in spec["templates"]] == ["analysis", "guide", "reading"], "Three master types missing")
    require(set(spec["templates"][2]["published_labels"]) == {"READING NOTE", "TRANSLATION"}, "Reading/translation labels merged")
    master_texts = []
    for template in spec["templates"]:
        root = ET.parse(BRANDING / template["file"]).getroot()
        require(root.get("viewBox") == "0 0 1200 630", f"Invalid viewBox: {template['id']}")
        require(not root.findall(".//s:image", NS), f"Flattened image in SVG: {template['id']}")
        ids = [e.get("id") for e in root.iter() if e.get("id")]
        require(len(ids) == len(set(ids)), f"Duplicate SVG IDs: {template['id']}")
        require({"title-line-1", "title-line-2", "title-line-3", "author", "domain"} <= set(ids), "Editable title/footer objects missing")
        texts = ["".join(e.itertext()) for e in root.findall(".//s:text", NS)]
        require(len(texts) >= 11, f"Independent text objects missing: {template['id']}")
        require(root.find("s:g[@id='topic-motif']/s:path", NS) is not None, "Editable motif paths missing")
        master_texts.append(texts)
    return spec, master_texts


def check_layout(draw: ImageDraw.ImageDraw, title: str, spec: dict, fallback: bool = False) -> None:
    font, lines, illustrated = og.title_layout(draw, title)
    rules = spec["layout"]["title"]
    require(compact("".join(lines)) == compact(title), f"Title characters lost: {title[:60]}")
    require(1 <= len(lines) <= rules["maximum_lines"], f"Title line count: {title[:60]}")
    width = rules["illustrated_width"] if illustrated else rules["text_only_width"]
    require(all(draw.textlength(line, font=font) <= width for line in lines), "Title exceeds its text region")
    require(font.size >= rules["minimum_illustrated_size" if illustrated else "minimum_text_only_size"], "Title too small")
    if fallback:
        require(not illustrated, "Long title failed to switch to full-width text")


def check_cards(spec: dict) -> int:
    posts = []
    for path in sorted(og.POSTS_DIR.rglob("*.md")):
        meta = og.front_matter(path)
        if path.name != "_index.md" and meta.get("title") and not meta.get("draft"):
            posts.append(meta)
    expected = {og.card_path(str(meta["title"]).strip()) for meta in posts}
    require(len(expected) == len(posts), "Duplicate article-title asset IDs")
    require(set(og.OUTPUT_DIR.glob("*.png")) == expected, "Missing or stale generated PNGs")
    draw = ImageDraw.Draw(Image.new("RGB", (og.WIDTH, og.HEIGHT)))
    fixtures = ["研究方法与可信边界" * 8, "InteroperabilityWithoutWhitespace" * 4]
    for meta in posts:
        check_layout(draw, str(meta["title"]).strip(), spec)
        with Image.open(og.card_path(str(meta["title"]).strip())) as image:
            require(image.size == (1200, 630) and image.mode == "RGB", "Invalid generated card dimensions/mode")
            image.verify()
    for title in fixtures:
        check_layout(draw, title, spec, fallback=True)
    scratch = Path.home() / ".codex" / "work"
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="blog-cover-check-", dir=scratch) as directory:
        output = Path(directory) / "card.png"
        for meta in posts + [{"title": title} for title in fixtures]:
            og.draw_card(meta, output)
            first = hashlib.sha256(output.read_bytes()).digest()
            og.draw_card(meta, output)
            require(hashlib.sha256(output.read_bytes()).digest() == first, "Non-deterministic PNG generation")
    # Fail explicitly on an excessive title, instead of silently dropping text.
    try:
        og.title_layout(draw, "超限标题" * 100)
    except ValueError:
        pass
    else:
        raise AssertionError("Excessive-title negative case did not fail")
    # Simulate a font whose CJK glyph is the same missing-glyph box as U+FFFF.
    # Bypass the font cache so the production coverage guard is exercised.
    class NoCJKFont:
        def getmask(self, _text: str) -> bytes:
            return b"missing-glyph"

    with patch.object(og.ImageFont, "truetype", return_value=NoCJKFont()) as font_fixture:
        try:
            og.load_font.__wrapped__(24, False)
        except RuntimeError as error:
            require("CJK" in str(error), "Unclear missing-font diagnostic")
        else:
            raise AssertionError("Unsupported-CJK-font negative case did not fail")
        require(font_fixture.called, "Unsupported-font fixture was not exercised")
    return len(posts)


def check_pptx(master_texts: list[list[str]]) -> tuple[int, int]:
    source = og.ROOT / "design" / "cover-masters" / "BlueDog-Cover-Masters.pptx"
    text_count = 0
    with ZipFile(source) as archive:
        presentation = ET.fromstring(archive.read("ppt/presentation.xml"))
        require(len(presentation.findall("p:sldIdLst/p:sldId", NS)) == 3, "PPTX must contain three slides")
        size = presentation.find("p:sldSz", NS)
        require(size is not None and (int(size.get("cx", "0")), int(size.get("cy", "0")))
                == (1200 * 9525, 630 * 9525), "PPTX canvas must be 1200×630")
        for index, expected in enumerate(master_texts, 1):
            slide = ET.fromstring(archive.read(f"ppt/slides/slide{index}.xml"))
            text_shapes = [s for s in slide.findall(".//p:sp", NS) if s.find("p:txBody", NS) is not None]
            actual = ["".join(s.itertext()) for s in slide.findall(".//a:t", NS)]
            require(actual == expected and len(text_shapes) == len(expected), f"PPTX slide {index}: editable text mismatch")
            require(not slide.findall(".//p:pic", NS), f"PPTX slide {index}: rasterized page")
            require(len(slide.findall(".//a:custGeom/a:pathLst/a:path/a:lnTo", NS)) >= 3,
                    f"PPTX slide {index}: independent native line paths missing")
            text_count += len(text_shapes)
    return 3, text_count


def main() -> int:
    try:
        spec, texts = check_masters()
        count = check_cards(spec)
        pages, objects = check_pptx(texts)
    except (AssertionError, OSError, ValueError, KeyError, RuntimeError, ET.ParseError) as error:
        print(f"[FAIL] Cover system: {error}", file=sys.stderr)
        return 1
    print(f"[OK] Cover system: 3 editable SVG masters; {count} complete 1200×630 PNGs; "
          f"deterministic regeneration; long CJK/English fallbacks; 2 negative cases; "
          f"{pages} PPTX slides with {objects} independent text objects and native lines")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
