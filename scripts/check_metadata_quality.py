#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import yaml


POSTS_ROOT = Path("content/posts")
FM_PATTERN = re.compile(r"^---\n(.*?)\n---\n?", re.S)
INVALID_DESCRIPTION_PATTERNS = [
    re.compile(r"^(本文记于|更新于|记录于)"),
    re.compile(r"^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}"),
]


def iter_post_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*.md")):
        if path.name == "_index.md":
            continue
        yield path


def ensure_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            text = str(item).strip()
            if text:
                out.append(text)
        return out
    return []


def strip_markdown(text: str) -> str:
    clean = re.sub(r"!\[[^\]]*]\([^)]+\)", " ", text)
    clean = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", clean)
    clean = re.sub(r"https?://\S+", " ", clean)
    clean = re.sub(r"`{1,3}([^`]*)`{1,3}", r"\1", clean)
    clean = re.sub(r"[*_~#]", "", clean)
    clean = re.sub(r"<[^>]+>", " ", clean)
    return re.sub(r"\s+", " ", clean).strip()


def load_front_matter(path: Path) -> Tuple[Dict[str, Any], str]:
    text = path.read_text(encoding="utf-8")
    match = FM_PATTERN.match(text)
    if not match:
        return {}, text
    front = yaml.safe_load(match.group(1)) or {}
    return front, text


def is_valid_description(text: str, min_len: int, max_len: int = 180) -> bool:
    clean = strip_markdown(text)
    if len(clean) < min_len or len(clean) > max_len:
        return False
    if clean.startswith(("原文地址", "原文链接", "译者", "原文作者", "本文记于")):
        return False
    if re.fullmatch(r"[0-9:\-年月日点分秒 ]+", clean):
        return False
    return not any(pattern.search(clean) for pattern in INVALID_DESCRIPTION_PATTERNS)


def check_file(path: Path, front: Dict[str, Any]) -> List[str]:
    problems: List[str] = []
    path_str = path.as_posix()

    title = str(front.get("title", "") or "").strip()
    if not title:
        problems.append("缺少 title")

    date_value = front.get("date")
    if date_value in (None, ""):
        problems.append("缺少 date")

    draft = bool(front.get("draft", False))

    description = str(front.get("description", "") or "").strip()
    min_desc_len = 24 if draft else 28
    if not is_valid_description(description, min_desc_len):
        problems.append("description 不合格（长度或内容规则不通过）")

    categories = ensure_list(front.get("categories"))
    if not categories:
        problems.append("缺少 categories")
    elif len(categories) > 2:
        problems.append("categories 过多（建议 1-2 个）")

    tags = ensure_list(front.get("tags"))
    min_tags = 1 if draft else 2
    if len(tags) < min_tags:
        problems.append(f"tags 太少（至少 {min_tags} 个）")
    if len(tags) > 8:
        problems.append("tags 太多（最多 8 个）")

    keywords = ensure_list(front.get("keywords"))
    min_keywords = 2 if draft else 3
    if len(keywords) < min_keywords:
        problems.append(f"keywords 太少（至少 {min_keywords} 个）")
    if len(keywords) > 10:
        problems.append("keywords 太多（最多 10 个）")

    cover = front.get("cover")
    if not isinstance(cover, dict):
        problems.append("缺少 cover 配置")
    else:
        image = str(cover.get("image", "") or "").strip()
        if not image:
            problems.append("cover.image 为空")
        if image and not (image.startswith("/") or image.startswith("http://") or image.startswith("https://")):
            problems.append("cover.image 应为绝对 URL 或以 / 开头的站内路径")

    if not draft and "/pending/" in path_str:
        problems.append("pending 目录文章应保持 draft: true")

    return problems


def main() -> None:
    files = list(iter_post_files(POSTS_ROOT))
    total = len(files)
    bad = 0

    for path in files:
        front, _ = load_front_matter(path)
        if not front:
            bad += 1
            print(f"[FAIL] {path.as_posix()}: 缺少 front matter")
            continue

        problems = check_file(path, front)
        if problems:
            bad += 1
            print(f"[FAIL] {path.as_posix()}")
            for item in problems:
                print(f"  - {item}")

    if bad == 0:
        print(f"[OK] Metadata quality check passed. Checked {total} posts.")
        return

    print(f"[ERROR] Metadata quality check failed: {bad}/{total} posts have issues.")
    sys.exit(1)


if __name__ == "__main__":
    main()
