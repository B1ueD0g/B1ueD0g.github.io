#!/usr/bin/env python3
"""Generate complete, deterministic editorial covers for published Hugo posts.

The three editable masters and layout rules live in static/branding/cover-*.
Existing article artwork remains authoritative in the Hugo social-image partial.
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "content" / "posts"
OUTPUT_DIR = ROOT / "static" / "generated" / "og"
FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
WIDTH = 1200
HEIGHT = 630
PAPER = "#f4f4f2"
INK = "#11151c"
BLUE = "#315c78"
MUTED = "#56616a"
RULE = "#c9cecf"
TINT = "#e8edef"


@lru_cache(maxsize=None)
def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    requested = os.environ.get("OG_FONT_PATH")
    candidates: list[tuple[str, int]] = []
    if requested:
        candidates.append((requested, 0))
    candidates.extend(
        [
            ("/System/Library/Fonts/Hiragino Sans GB.ttc", 1 if bold else 0),
            ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
            (f"/usr/share/fonts/opentype/noto/NotoSansCJK-{'Bold' if bold else 'Regular'}.ttc", 2),
            ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 2),
        ]
    )
    for font_path, index in candidates:
        if not Path(font_path).exists():
            continue
        try:
            font = ImageFont.truetype(font_path, size=size, index=index)
            # A Latin-only fallback otherwise renders every Chinese character as
            # a square while reporting a successful build.
            if bytes(font.getmask("中")) != bytes(font.getmask("\uffff")):
                return font
        except OSError:
            continue
    raise RuntimeError("No usable CJK font found. Install fonts-noto-cjk or set OG_FONT_PATH to a CJK font.")


def front_matter(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    match = FRONT_MATTER.match(text)
    if not match:
        return {}
    payload = yaml.safe_load(match.group(1)) or {}
    return payload if isinstance(payload, dict) else {}


def content_type(meta: dict[str, object]) -> tuple[str, str]:
    categories = {str(item) for item in (meta.get("categories") or [])}
    tags = {str(item) for item in (meta.get("tags") or [])}
    title = str(meta.get("title") or "")
    if "好文翻译" in categories or {"翻译", "技术译文"} & tags:
        return "TRANSLATION", BLUE
    if "国学经典" in categories or {"读书笔记", "阅读思考"} & tags:
        return "READING NOTE", BLUE
    if "科研总结系列" in categories or "科研方法" in tags:
        return "ORIGINAL ANALYSIS", BLUE
    if "实操指南" in tags or any(term in title for term in ("教程", "部署", "搭建")):
        return "FIELD GUIDE", BLUE
    return "ORIGINAL ANALYSIS", BLUE


def template_type(meta: dict[str, object]) -> str:
    label, _ = content_type(meta)
    if label in {"TRANSLATION", "READING NOTE"}:
        return "reading"
    return "guide" if label == "FIELD GUIDE" else "analysis"


def normalize_date(value: object) -> str:
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y.%m.%d")
    text = str(value or "").strip()
    return text[:10].replace("-", ".") if text else "ARCHIVE"


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9][A-Za-z0-9+._:/-]*|\s+|.", text)


def wrap_title(draw: ImageDraw.ImageDraw, title: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Wrap without discarding text, including oversized unbroken Latin tokens."""
    lines: list[str] = []
    current = ""
    closing = set("，。！？；：、）》】』」,.!?;:)]}")
    for token in tokenize(title.strip()):
        # Preserve whole Latin words when possible; split only words wider than
        # the available line. Chinese characters already arrive individually.
        pieces = list(token) if draw.textlength(token, font=font) > max_width else [token]
        for piece in pieces:
            candidate = current + piece
            if current and draw.textlength(candidate, font=font) > max_width:
                if piece in closing and len(current) > 1:
                    lines.append(current[:-1].rstrip())
                    current = current[-1] + piece
                else:
                    lines.append(current.rstrip())
                    current = piece.lstrip()
            else:
                current = candidate
    if current:
        lines.append(current.rstrip())
    return lines


def title_layout(draw: ImageDraw.ImageDraw, title: str) -> tuple[ImageFont.FreeTypeFont, list[str], bool]:
    """Prefer a 15% topic illustration; long titles receive the full width.

    Never truncate. Fail the generator for an unreasonable title rather than
    silently shipping a cropped or illegible card.
    """
    for width, sizes, illustrated in ((700, range(64, 53, -2), True), (1056, range(64, 35, -2), False)):
        for size in sizes:
            font = load_font(size, bold=True)
            lines = wrap_title(draw, title, font, width)
            if len(lines) <= 3 and all(draw.textlength(line, font=font) <= width for line in lines):
                return font, lines, illustrated
    raise ValueError(f"Title cannot fit three complete readable lines: {title!r}")


def topic_label(meta: dict[str, object]) -> str:
    """An editorial topic cue, never a claim about measured scientific results."""
    title = str(meta.get("title") or "")
    for keywords, label in (
        (("SDN", "拓扑"), "TOPOLOGY"),
        (("OVTP", "ARCP", "NbSP"), "TRUST BOUNDARY"),
        (("OpenClaw", "树莓派", "部署", "搭建"), "SYSTEMS"),
        (("Nacos", "NHP", "协议"), "PROTOCOLS"),
        (("AI", "LLM", "大模型", "人工智能", "Agent"), "AI & SECURITY"),
        (("科研", "文献", "研究方法"), "RESEARCH"),
        (("云", "Kubernetes"), "CLOUD SECURITY"),
        (("数据", "隐私"), "DATA & PRIVACY"),
    ):
        if any(word in title for word in keywords):
            return label
    return "READING NOTES" if template_type(meta) == "reading" else "SECURITY NOTES"


def draw_motif(draw: ImageDraw.ImageDraw, kind: str, label: str) -> None:
    """Quiet native lines, occupying a 336 x 340 editorial region (15.1%)."""
    draw.line((804, 190, 804, 484), fill=RULE, width=1)
    if kind == "analysis":
        draw.rounded_rectangle((852, 226, 1092, 420), radius=8, fill=TINT)
        for y in range(238, 421, 12):
            draw.line((866, y, 866, min(y + 5, 421)), fill=BLUE, width=2)
        nodes = ((882, 280), (948, 280), (1056, 280), (1062, 368))
        if label in {"AI & SECURITY", "TOPOLOGY"}:
            nodes = ((904, 270), (904, 378), (978, 324), (1054, 270), (1054, 378))
            for x, y in nodes:
                if (x, y) != (978, 324):
                    draw.line((x, y, 978, 324), fill=BLUE, width=2)
        elif label == "RESEARCH":
            nodes = ((900, 265), (968, 324), (1040, 380))
            draw.line((900, 265, 968, 324, 1040, 380), fill=BLUE, width=3)
            for x, y in nodes:
                draw.line((x - 10, y + 22, x + 10, y + 22), fill=BLUE, width=2)
        elif label == "CLOUD SECURITY":
            nodes = ()
            for y in (250, 304, 358):
                draw.rounded_rectangle((894, y, 1064, y + 34), radius=4, fill=PAPER, outline=BLUE, width=2)
                draw.line((908, y + 17, 982, y + 17), fill=RULE, width=2)
                draw.ellipse((1040, y + 13, 1048, y + 21), fill=BLUE)
        else:
            draw.line((882, 280, 948, 280, 948, 368, 1062, 368), fill=BLUE, width=3)
            draw.line((948, 280, 1056, 280), fill=BLUE, width=3)
            draw.line((1006, 338, 1006, 396), fill=RULE, width=2)
            draw.line((997, 338, 1015, 338), fill=RULE, width=2)
            draw.line((997, 396, 1015, 396), fill=RULE, width=2)
        for x, y in nodes:
            draw.ellipse((x - 8, y - 8, x + 8, y + 8), fill=PAPER, outline=BLUE, width=3)
    elif kind == "guide":
        for index, (x, y) in enumerate(((852, 228), (892, 302), (932, 376))):
            draw.rounded_rectangle((x, y, x + 170, y + 48), radius=6, fill=TINT, outline=BLUE, width=2)
            draw.text((x + 17, y + 12), f"{index + 1:02d}", font=load_font(18, True), fill=BLUE, anchor="lt")
            draw.line((x + 60, y + 20, x + 142, y + 20), fill=BLUE, width=2)
            draw.line((x + 60, y + 30, x + 120, y + 30), fill=RULE, width=2)
            if index < 2:
                draw.line((x + 22, y + 50, x + 22, y + 64, x + 62, y + 64), fill=BLUE, width=2)
                draw.polygon(((x + 62, y + 64), (x + 54, y + 60), (x + 54, y + 68)), fill=BLUE)
    else:
        draw.rounded_rectangle((866, 226, 1068, 420), radius=6, fill=TINT)
        draw.rectangle((850, 214, 1052, 408), fill=PAPER, outline=BLUE, width=2)
        for index, end in enumerate((1016, 990, 1020, 978, 1006)):
            y = 254 + index * 25
            draw.line((879, y, end, y), fill=BLUE if index == 2 else RULE, width=3 if index == 2 else 2)
        draw.line((1032, 295, 1094, 295, 1094, 348), fill=BLUE, width=2)
        draw.ellipse((1089, 343, 1099, 353), fill=BLUE)
    font = load_font(16, bold=True)
    label_width = draw.textlength(label, font=font)
    draw.text((972 - label_width / 2, 458), label, font=font, fill=BLUE, anchor="lt")


def card_path(title: str) -> Path:
    digest = hashlib.md5(title.encode("utf-8"), usedforsecurity=False).hexdigest()
    return OUTPUT_DIR / f"{digest}.png"


def draw_card(meta: dict[str, object], output: Path) -> None:
    title = str(meta.get("title") or "Untitled").strip()
    label, _ = content_type(meta)
    published = normalize_date(meta.get("date"))
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)

    ui_font = load_font(28, bold=True)
    small_font = load_font(21)
    title_font, lines, illustrated = title_layout(draw, title)

    draw.rectangle((72, 65, 78, 91), fill=BLUE)
    draw.text((96, 62), "BlueDog’s Blog", font=ui_font, fill=INK, anchor="lt")
    strapline = "RESEARCH · NOTES · PRACTICE"
    strap_font = load_font(18)
    draw.text((1128 - draw.textlength(strapline, font=strap_font), 69), strapline, font=strap_font, fill=MUTED, anchor="lt")
    draw.line((72, 122, 1128, 122), fill=RULE, width=1)
    draw.text((72, 153), label, font=load_font(21, True), fill=BLUE, anchor="lt")
    draw.text((1128 - draw.textlength(published, font=small_font), 153), published, font=small_font, fill=MUTED, anchor="lt")

    line_height = int(title_font.size * 1.3)
    block_height = (len(lines) - 1) * line_height + title_font.size
    y = 211 + max(0, (234 - block_height) // 2)
    for line in lines:
        draw.text((72, y), line, font=title_font, fill=INK, anchor="lt")
        y += line_height
    if illustrated:
        draw_motif(draw, template_type(meta), topic_label(meta))

    draw.line((72, 522, 1128, 522), fill=RULE, width=1)
    author = str(meta.get("author") or "BlueDog")
    if len(author) > 40:
        author = "BlueDog"
    draw.text((72, 553), author, font=small_font, fill=INK, anchor="lt")
    marker = f"ARCHIVE / {card_path(title).stem[:6].upper()}"
    marker_font = load_font(16)
    draw.text((600 - draw.textlength(marker, font=marker_font) / 2, 557), marker, font=marker_font, fill=MUTED, anchor="lt")
    domain = "bluedog.website"
    draw.text((1128 - draw.textlength(domain, font=small_font), 553), domain, font=small_font, fill=MUTED, anchor="lt")

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True, compress_level=9)


def draw_brand_card(output: Path) -> None:
    """Keep the site-wide PNG fallback aligned with the article cover system."""
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)
    draw.rectangle((72, 65, 78, 91), fill=BLUE)
    draw.text((96, 62), "BlueDog’s Blog", font=load_font(28, True), fill=INK, anchor="lt")
    draw.line((72, 122, 1128, 122), fill=RULE, width=1)
    draw.text((72, 190), "He is Exploring", font=load_font(72, True), fill=INK, anchor="lt")
    draw.text((72, 280), "Everything.", font=load_font(72, True), fill=INK, anchor="lt")
    draw.text((76, 399), "Progress, Not Perfection", font=load_font(30), fill=BLUE, anchor="lt")
    draw.line((72, 522, 1128, 522), fill=RULE, width=1)
    draw.text((72, 553), "BlueDog", font=load_font(21), fill=INK, anchor="lt")
    domain = "bluedog.website"
    font = load_font(21)
    draw.text((1128 - draw.textlength(domain, font=font), 553), domain, font=font, fill=MUTED, anchor="lt")
    image.save(output, format="PNG", optimize=True, compress_level=9)


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    expected: set[Path] = set()
    count = 0
    for path in sorted(POSTS_DIR.rglob("*.md")):
        if path.name == "_index.md":
            continue
        meta = front_matter(path)
        if not meta or bool(meta.get("draft")):
            continue
        title = str(meta.get("title") or "").strip()
        if not title:
            continue
        output = card_path(title)
        expected.add(output)
        draw_card(meta, output)
        count += 1

    for stale in OUTPUT_DIR.glob("*.png"):
        if stale not in expected:
            stale.unlink()
    draw_brand_card(ROOT / "static" / "branding" / "og-default.png")
    print(f"[OK] Generated {count} Open Graph cards in {OUTPUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
