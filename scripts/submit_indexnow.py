#!/usr/bin/env python3
"""Validate ownership and submit released sitemap URLs using the IndexNow protocol."""
from __future__ import annotations

import argparse
import codecs
import json
import posixpath
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

USER_AGENT = "BlueDogBlogIndexNow/1.1"
MAX_RESPONSE_BYTES = 4096
ACCEPTED_STATUSES = {200, 202}


def parse_sitemap(path: Path) -> list[str]:
    if not path.is_file():
        raise FileNotFoundError(f"sitemap not found: {path}")
    root = ET.fromstring(path.read_text(encoding="utf-8"))
    if root.tag.rsplit("}", 1)[-1] != "urlset":
        raise ValueError("Expected a URL sitemap (urlset), not a sitemap index")
    return list(dict.fromkeys(
        text for node in root.findall(".//{*}loc") if (text := (node.text or "").strip())
    ))


def http_url(value: str, label: str) -> urllib.parse.SplitResult:
    if not value.isascii() or re.search(r"[\x00-\x20\x7f]", value):
        raise ValueError(f"{label} must be an ASCII URL; percent-encode spaces and non-ASCII characters")
    if re.search(r"%(?![0-9A-Fa-f]{2})", value):
        raise ValueError(f"{label} contains an invalid percent escape")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"{label} must be an absolute HTTP(S) URL")
    if parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise ValueError(f"{label} must not contain credentials or a fragment")
    # Accessing .port also rejects malformed or out-of-range ports.
    _ = parsed.port
    return parsed


def validate_submission(host: str, key: str, key_location: str, urls: list[str]) -> None:
    if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", host) or ".." in host:
        raise ValueError("host must be a bare hostname without a scheme, port, or path")
    if not re.fullmatch(r"[A-Za-z0-9-]{8,128}", key):
        raise ValueError("key must contain 8-128 letters, digits, or dashes")
    location = http_url(key_location, "keyLocation")
    if location.hostname.lower() != host.lower() or location.query:
        raise ValueError("keyLocation must be a file on the submitted host, without query parameters")
    if not location.path or location.path.endswith("/"):
        raise ValueError("keyLocation must identify a file")
    directory = posixpath.dirname(urllib.parse.unquote(location.path)).rstrip("/") + "/"
    for url in urls:
        parsed = http_url(url, "sitemap URL")
        if parsed.hostname.lower() != host.lower():
            raise ValueError(f"sitemap URL belongs to a different host: {url}")
        decoded_path = urllib.parse.unquote(parsed.path or "/")
        normalized_path = posixpath.normpath(decoded_path)
        if decoded_path.endswith("/") and normalized_path != "/":
            normalized_path += "/"
        if not normalized_path.startswith(directory):
            raise ValueError(f"sitemap URL is outside the keyLocation directory: {url}")


def response_body(response: object) -> str:
    raw = response.read(MAX_RESPONSE_BYTES + 1)
    body = raw[:MAX_RESPONSE_BYTES].decode("utf-8", errors="replace")
    if len(raw) > MAX_RESPONSE_BYTES:
        body += " [truncated]"
    return body


def http_error(action: str, url: str, error: urllib.error.HTTPError) -> RuntimeError:
    body = response_body(error)
    return RuntimeError(
        f"{action} {url} returned HTTP {error.code} {error.reason}; "
        f"response body={json.dumps(body, ensure_ascii=False)}"
    )


def verify_key_file(key_location: str, key: str, timeout: int) -> None:
    request = urllib.request.Request(key_location, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise RuntimeError(f"Key preflight returned HTTP {response.status}")
            final = http_url(response.geturl(), "resolved keyLocation")
            if final.hostname != urllib.parse.urlsplit(key_location).hostname:
                raise RuntimeError("Key preflight redirected to a different host")
            raw = response.read(1025)
    except urllib.error.HTTPError as error:
        raise http_error("Key preflight GET", key_location, error) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"Key preflight GET {key_location} failed: {error}") from error
    if len(raw) > 1024:
        raise RuntimeError("Public key file is larger than a plain IndexNow key")
    if raw.startswith(codecs.BOM_UTF8):
        raise RuntimeError("Public key file contains a UTF-8 BOM; serve the key without a BOM")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise RuntimeError("Public key file is not UTF-8 text") from error
    if text.rstrip("\r\n") != key:
        raise RuntimeError("Public key file content does not match the submitted key")


def preflight_key(key_location: str, key: str, timeout: int, attempts: int, delay: float) -> None:
    for attempt in range(1, attempts + 1):
        try:
            verify_key_file(key_location, key, timeout)
            print(f"[IndexNow] public key verified at {key_location}", flush=True)
            return
        except RuntimeError as error:
            if attempt == attempts:
                raise
            print(f"[IndexNow] key preflight {attempt}/{attempts} failed: {error}; retrying in {delay}s", file=sys.stderr)
            time.sleep(delay)


def post_indexnow(endpoint: str, payload: dict, timeout: int) -> tuple[int, str]:
    http_url(endpoint, "endpoint")
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
            body = response_body(response)
            if response.geturl() != endpoint:
                raise RuntimeError(f"IndexNow POST redirected from {endpoint} to {response.geturl()}")
            if status not in ACCEPTED_STATUSES:
                raise RuntimeError(f"IndexNow POST {endpoint} returned HTTP {status}; response body={json.dumps(body)}")
            return status, body
    except urllib.error.HTTPError as error:
        raise http_error("IndexNow POST", endpoint, error) from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise RuntimeError(f"IndexNow POST {endpoint} failed: {error}") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sitemap", type=Path, required=True)
    parser.add_argument("--host", required=True, help="Bare site hostname, e.g. bluedog.website")
    parser.add_argument("--key", required=True, help="IndexNow ownership key")
    parser.add_argument("--key-location", help="Public URL of the key file")
    parser.add_argument("--endpoint", default="https://api.indexnow.org/indexnow")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--key-check-attempts", type=int, default=3)
    parser.add_argument("--key-check-delay", type=float, default=2)
    parser.add_argument("--dry-run", action="store_true", help="Validate local inputs without network requests")
    parser.add_argument("--check-key-only", action="store_true", help="Verify the public key without submitting URLs")
    args = parser.parse_args(argv)
    if not 1 <= args.batch_size <= 10_000:
        parser.error("--batch-size must be between 1 and 10000")
    if not 1 <= args.timeout <= 120 or not 1 <= args.key_check_attempts <= 10 or not 0 <= args.key_check_delay <= 30:
        parser.error("timeout must be 1-120s; key checks 1-10 attempts with a 0-30s delay")
    try:
        key_location = args.key_location or f"https://{args.host}/{args.key}.txt"
        urls = parse_sitemap(args.sitemap)
        if not urls:
            raise ValueError("No URLs found in sitemap; no submission was made")
        validate_submission(args.host, args.key, key_location, urls)
        http_url(args.endpoint, "endpoint")
        print(f"[IndexNow] validated {len(urls)} sitemap URLs for {args.host}", flush=True)
        if args.dry_run:
            print("[IndexNow] dry-run: local inputs validated; no network request sent.")
            return 0
        preflight_key(key_location, args.key, args.timeout, args.key_check_attempts, args.key_check_delay)
        if args.check_key_only:
            print("[IndexNow] key check complete; no URLs submitted.")
            return 0
        for offset in range(0, len(urls), args.batch_size):
            batch = urls[offset:offset + args.batch_size]
            payload = {"host": args.host, "key": args.key, "keyLocation": key_location, "urlList": batch}
            status, body = post_indexnow(args.endpoint, payload, args.timeout)
            receipt = "received; key validation pending" if status == 202 else "received"
            print(f"[IndexNow] batch {offset // args.batch_size + 1}: HTTP {status}, {receipt}, URLs={len(batch)}; response body={json.dumps(body)}", flush=True)
        print("[IndexNow] notification receipt does not confirm crawling or indexing.")
        return 0
    except (ValueError, OSError, ET.ParseError, RuntimeError) as error:
        print(f"[IndexNow] failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
