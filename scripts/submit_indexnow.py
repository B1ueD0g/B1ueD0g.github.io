#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List


def parse_sitemap(path: Path) -> List[str]:
    if not path.exists():
        raise FileNotFoundError(f"sitemap not found: {path}")

    root = ET.fromstring(path.read_text(encoding="utf-8"))
    urls: List[str] = []
    for node in root.findall(".//{*}loc"):
        text = (node.text or "").strip()
        if text:
            urls.append(text)

    deduped: List[str] = []
    seen = set()
    for url in urls:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    return deduped


def post_indexnow(endpoint: str, payload: dict, timeout: int) -> None:
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "BlueDogBlogIndexNow/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        status = getattr(resp, "status", 200)
        if status < 200 or status >= 300:
            raise RuntimeError(f"IndexNow HTTP status: {status}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Submit sitemap URLs to IndexNow.")
    parser.add_argument("--sitemap", type=Path, required=True, help="Path to sitemap.xml")
    parser.add_argument("--host", required=True, help="Site host, e.g. bluedog.website")
    parser.add_argument("--key", required=True, help="IndexNow key")
    parser.add_argument("--key-location", help="Public URL of key file")
    parser.add_argument("--endpoint", default="https://api.indexnow.org/indexnow")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    key_location = args.key_location or f"https://{args.host.rstrip('/')}/{args.key}.txt"
    urls = parse_sitemap(args.sitemap)
    if not urls:
        print("[IndexNow] no URLs found in sitemap, skip.")
        return

    print(f"[IndexNow] discovered {len(urls)} URLs from {args.sitemap}")
    if args.dry_run:
        print("[IndexNow] dry-run mode, no request sent.")
        return

    for i in range(0, len(urls), max(1, args.batch_size)):
        batch = urls[i : i + max(1, args.batch_size)]
        payload = {
            "host": args.host,
            "key": args.key,
            "keyLocation": key_location,
            "urlList": batch,
        }
        try:
            post_indexnow(args.endpoint, payload, timeout=args.timeout)
            print(f"[IndexNow] submitted batch {i // args.batch_size + 1}, size={len(batch)}")
        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError) as exc:
            print(f"[IndexNow] submission failed: {exc}", file=sys.stderr)
            raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
