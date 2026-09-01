#!/usr/bin/env python3
"""Fail a production build when critical generated-site contracts regress."""

from __future__ import annotations

import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
MAX_SEARCH_HTML_BYTES = 100_000


class PageAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: set[str] = set()
        self.duplicate_ids: set[str] = set()
        self.id_refs: list[tuple[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.meta: dict[str, str] = {}
        self.manifests: list[str] = []
        self.json_ld: list[str] = []
        self._json_buffer: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        element_id = values.get("id", "").strip()
        if element_id:
            if element_id in self.ids:
                self.duplicate_ids.add(element_id)
            self.ids.add(element_id)

        for attribute in ("aria-controls", "aria-describedby", "aria-labelledby"):
            for target in values.get(attribute, "").split():
                self.id_refs.append((attribute, target))

        if tag == "img":
            self.images.append(values)
        elif tag == "meta":
            key = values.get("property") or values.get("name")
            if key:
                self.meta[key.lower()] = values.get("content", "")
        elif tag == "link" and "manifest" in values.get("rel", "").lower().split():
            self.manifests.append(values.get("href", ""))
        elif tag == "script" and values.get("type", "").lower() == "application/ld+json":
            self._json_buffer = []

    def handle_data(self, data: str) -> None:
        if self._json_buffer is not None:
            self._json_buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._json_buffer is not None:
            self.json_ld.append("".join(self._json_buffer).strip())
            self._json_buffer = None


def schema_nodes(payload: object) -> list[dict[str, object]]:
    if not isinstance(payload, dict):
        return []
    graph = payload.get("@graph")
    if isinstance(graph, list):
        return [node for node in graph if isinstance(node, dict)]
    return [payload]


def schema_types(node: dict[str, object]) -> set[str]:
    value = node.get("@type")
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return {str(item) for item in value}
    return set()


def local_path(url: str) -> Path | None:
    parsed = urlparse(url)
    if parsed.netloc and parsed.netloc not in {"bluedog.website", "www.bluedog.website"}:
        return None
    if not parsed.path.startswith("/"):
        return None
    return PUBLIC / parsed.path.lstrip("/")


def main() -> int:
    errors: list[str] = []
    html_files = sorted(PUBLIC.rglob("*.html"))
    if not html_files:
        errors.append("public contains no HTML files")
    if not (PUBLIC / "pagefind" / "pagefind.js").is_file():
        errors.append("Pagefind index is missing public/pagefind/pagefind.js")

    pages: dict[Path, tuple[PageAudit, list[dict[str, object]]]] = {}
    article_count = 0
    referenced_cards: set[Path] = set()

    for path in html_files:
        text = path.read_text(encoding="utf-8")
        parser = PageAudit()
        parser.feed(text)
        nodes: list[dict[str, object]] = []
        for index, source in enumerate(parser.json_ld, start=1):
            try:
                nodes.extend(schema_nodes(json.loads(source)))
            except json.JSONDecodeError as error:
                errors.append(f"{path.relative_to(PUBLIC)} has invalid JSON-LD #{index}: {error}")
        pages[path] = (parser, nodes)

        if parser.duplicate_ids:
            errors.append(
                f"{path.relative_to(PUBLIC)} has duplicate ids: {', '.join(sorted(parser.duplicate_ids))}"
            )
        for attribute, target in parser.id_refs:
            if target not in parser.ids:
                errors.append(f"{path.relative_to(PUBLIC)} has unresolved {attribute}=#{target}")
        for image in parser.images:
            if "alt" not in image:
                errors.append(f"{path.relative_to(PUBLIC)} has an image without alt: {image.get('src', '')}")
            elif not image.get("alt", "").strip() and image.get("role") != "presentation" and image.get("aria-hidden") != "true":
                errors.append(f"{path.relative_to(PUBLIC)} has an unexplained empty image alt: {image.get('src', '')}")
        if parser.manifests:
            errors.append(f"{path.relative_to(PUBLIC)} links an unsupported web app manifest")

        for node in nodes:
            if "BlogPosting" not in schema_types(node):
                continue
            article_count += 1
            if "articleBody" in node:
                errors.append(f"{path.relative_to(PUBLIC)} embeds articleBody in JSON-LD")
            image_value = node.get("image")
            image_url = image_value if isinstance(image_value, str) else ""
            if isinstance(image_value, dict):
                image_url = str(image_value.get("url", ""))
            if "/generated/og/" not in image_url:
                errors.append(f"{path.relative_to(PUBLIC)} does not use a generated article social card")
            generated = local_path(image_url)
            if generated:
                referenced_cards.add(generated)
                if not generated.is_file():
                    errors.append(f"{path.relative_to(PUBLIC)} references missing social card {generated.relative_to(PUBLIC)}")
            og_image = parser.meta.get("og:image", "")
            if not og_image:
                errors.append(f"{path.relative_to(PUBLIC)} has no og:image")

    search_path = PUBLIC / "search" / "index.html"
    if not search_path.is_file():
        errors.append("search page is missing")
    else:
        search_text = search_path.read_text(encoding="utf-8")
        search_parser, search_nodes = pages[search_path]
        search_types = set().union(*(schema_types(node) for node in search_nodes)) if search_nodes else set()
        if search_path.stat().st_size > MAX_SEARCH_HTML_BYTES:
            errors.append(f"search HTML exceeds {MAX_SEARCH_HTML_BYTES} bytes")
        if "SearchResultsPage" not in search_types:
            errors.append("search page schema is not SearchResultsPage")
        if "BlogPosting" in search_types or "articleBody" in search_text:
            errors.append("search page leaked article schema or article body data")
        for forbidden in ("search-data-json", "fastsearch.js", "fuse.js"):
            if forbidden in search_text.lower():
                errors.append(f"search page still contains legacy payload {forbidden}")
        if "noindex" not in search_parser.meta.get("robots", "").lower():
            errors.append("search page is not marked noindex")

    about_path = PUBLIC / "about" / "index.html"
    if about_path.is_file():
        _, about_nodes = pages[about_path]
        about_types = set().union(*(schema_types(node) for node in about_nodes)) if about_nodes else set()
        if "ProfilePage" not in about_types or "BlogPosting" in about_types:
            errors.append("about page schema must be ProfilePage and not BlogPosting")
    else:
        errors.append("about page is missing")

    for card in sorted(referenced_cards):
        try:
            with Image.open(card) as image:
                if image.size != (1200, 630) or image.format != "PNG":
                    errors.append(f"{card.relative_to(PUBLIC)} is not a 1200x630 PNG")
        except OSError as error:
            errors.append(f"cannot inspect {card.relative_to(PUBLIC)}: {error}")

    if article_count == 0:
        errors.append("no BlogPosting schema nodes were generated")

    if errors:
        for error in errors:
            print(f"[ERROR] {error}")
        print(f"[FAIL] Generated-site quality gate found {len(errors)} problem(s).")
        return 1

    search_size = search_path.stat().st_size if search_path.is_file() else 0
    print(
        f"[OK] Generated-site quality gate passed: {len(html_files)} HTML pages, "
        f"{article_count} articles, {len(referenced_cards)} social cards, "
        f"search HTML {search_size:,} bytes."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
