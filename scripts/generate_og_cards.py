#!/usr/bin/env python3
"""Generate deterministic Open Graph cards for published Hugo posts."""

from __future__ import annotations

import hashlib
import os
import re
from datetime import date, datetime
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "content" / "posts"
OUTPUT_DIR = ROOT / "static" / "generated" / "og"
FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
WIDTH = 1200
HEIGHT = 630


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    requested = os.environ.get("OG_FONT_PATH")
    candidates: list[tuple[str, int]] = []
    if requested:
        candidates.append((requested, 0))
    candidates.extend(
        [
            ("/System/Library/Fonts/Hiragino Sans GB.ttc", 1 if bold else 0),
            ("/System/Library/Fonts/STHeiti Medium.ttc", 0),
            ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 2),
            ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 2),
            ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0),
            ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 0),
        ]
    )
    for font_path, index in candidates:
        if not Path(font_path).exists():
            continue
        try:
            return ImageFont.truetype(font_path, size=size, index=index)
        except OSError:
            continue
    raise RuntimeError("No usable font found. Install fonts-noto-cjk or set OG_FONT_PATH.")


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
        return "TRANSLATION", "#4f6d8a"
    if "国学经典" in categories or {"读书笔记", "阅读思考"} & tags:
        return "READING NOTE", "#8a5b66"
    if "科研总结系列" in categories or "科研方法" in tags:
        return "RESEARCH METHOD", "#506f63"
    if "实操指南" in tags or any(term in title for term in ("教程", "部署", "搭建")):
        return "FIELD GUIDE", "#546a8a"
    return "ORIGINAL ANALYSIS", "#111827"


def normalize_date(value: object) -> str:
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y.%m.%d")
    text = str(value or "").strip()
    return text[:10].replace("-", ".") if text else "ARCHIVE"


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9][A-Za-z0-9+._:/-]*|\s+|.", text)


def wrap_title(draw: ImageDraw.ImageDraw, title: str, font: ImageFont.FreeTypeFont, max_width: int, max_lines: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for token in tokenize(title.strip()):
        candidate = current + token
        width = draw.textbbox((0, 0), candidate, font=font)[2]
        if current and width > max_width:
            lines.append(current.rstrip())
            current = token.lstrip()
            if len(lines) == max_lines:
                break
        else:
            current = candidate
    if current and len(lines) < max_lines:
        lines.append(current.rstrip())
    if len(lines) == max_lines and re.sub(r"\s+", "", "".join(lines)) != re.sub(r"\s+", "", title):
        last = lines[-1].rstrip(" .…")
        while last and draw.textbbox((0, 0), last + "…", font=font)[2] > max_width:
            last = last[:-1]
        lines[-1] = last + "…"
    return lines


def card_path(title: str) -> Path:
    digest = hashlib.md5(title.encode("utf-8"), usedforsecurity=False).hexdigest()
    return OUTPUT_DIR / f"{digest}.png"


def draw_card(meta: dict[str, object], output: Path) -> None:
    title = str(meta.get("title") or "Untitled").strip()
    label, accent = content_type(meta)
    published = normalize_date(meta.get("date"))
    image = Image.new("RGB", (WIDTH, HEIGHT), "#f4f4f2")
    draw = ImageDraw.Draw(image)

    for x in range(0, WIDTH, 48):
        draw.line((x, 0, x, HEIGHT), fill="#e4e7e8", width=1)
    for y in range(0, HEIGHT, 48):
        draw.line((0, y, WIDTH, y), fill="#e4e7e8", width=1)
    draw.rectangle((0, 0, 14, HEIGHT), fill=accent)
    draw.rectangle((14, 0, 18, HEIGHT), fill="#95d8f6")

    ui_font = load_font(24, bold=True)
    small_font = load_font(21)
    title_size = 62 if len(title) <= 34 else 54 if len(title) <= 52 else 47
    title_font = load_font(title_size, bold=True)

    draw.text((72, 62), "BLUEDOG RESEARCH ARCHIVE", font=ui_font, fill="#111827")
    draw.text((72, 104), f"{label}  /  {published}", font=small_font, fill="#667085")
    draw.line((72, 150, 1128, 150), fill="#b9bec5", width=2)

    lines = wrap_title(draw, title, title_font, 1010, 3)
    y = 202
    line_height = int(title_size * 1.28)
    for line in lines:
        draw.text((72, y), line, font=title_font, fill="#0f172a")
        y += line_height

    draw.line((72, 522, 1128, 522), fill="#c7ccd2", width=2)
    draw.text((72, 550), "bluedog.website", font=small_font, fill="#4b5563")
    marker = "01 / KNOWLEDGE SYSTEM"
    marker_width = draw.textbbox((0, 0), marker, font=small_font)[2]
    draw.text((1128 - marker_width, 550), marker, font=small_font, fill="#4b5563")

    output.parent.mkdir(parents=True, exist_ok=True)
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
    print(f"[OK] Generated {count} Open Graph cards in {OUTPUT_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
