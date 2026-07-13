#!/usr/bin/env python3
"""Generate stable short-link records for Hugo article pages."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "content" / "posts"
OUTPUT = ROOT / "data" / "shortlinks.json"
FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
DRAFT_TRUE = re.compile(r"(?mi)^draft:\s*(?:true|yes|on)\s*$")


def source_path(markdown_path: Path) -> str:
    relative = markdown_path.relative_to(ROOT / "content").with_suffix("")
    return "/" + relative.as_posix()


def short_id(markdown_path: Path) -> str:
    relative = markdown_path.relative_to(ROOT / "content").as_posix()
    return hashlib.md5(relative.encode("utf-8"), usedforsecurity=False).hexdigest()[:8]


def build_payload() -> dict[str, object]:
    items: list[dict[str, str]] = []
    seen: dict[str, str] = {}

    for markdown_path in sorted(POSTS_DIR.rglob("*.md")):
        if markdown_path.name == "_index.md":
            continue

        text = markdown_path.read_text(encoding="utf-8")
        match = FRONT_MATTER.match(text)
        if match and DRAFT_TRUE.search(match.group(1)):
            continue

        item_id = short_id(markdown_path)
        item_source = source_path(markdown_path)
        if item_id in seen:
            raise RuntimeError(
                f"Short-link collision: {item_id} maps to both {seen[item_id]} and {item_source}"
            )
        seen[item_id] = item_source
        items.append({"id": item_id, "source": item_source})

    return {"version": 1, "items": items}


def render_payload(payload: dict[str, object]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail when data/shortlinks.json is missing or stale.",
    )
    args = parser.parse_args()

    payload = build_payload()
    rendered = render_payload(payload)
    if args.check:
        current = OUTPUT.read_text(encoding="utf-8") if OUTPUT.exists() else ""
        if current != rendered:
            print("[ERROR] data/shortlinks.json is stale; run scripts/generate_shortlinks.py")
            return 1
        print("[OK] Short-link data is current.")
        return 0

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(rendered, encoding="utf-8")
    count = len(payload["items"])
    print(f"[OK] Generated {count} short links at {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
