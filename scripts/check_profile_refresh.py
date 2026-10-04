#!/usr/bin/env python3
"""Regression gate for the dated public-profile refresh; not a source-truth oracle."""
from __future__ import annotations

from copy import deepcopy
from html.parser import HTMLParser
import json
from pathlib import Path
import sys

import yaml

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "docs/profile-refresh-2026-10-04.json"


class Sections(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.text = {}
        self.links = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "section":
            self.stack.append(attrs.get("id", ""))
        if tag == "a":
            self.links.add(attrs.get("href", ""))

    def handle_endtag(self, tag):
        if tag == "section" and self.stack:
            self.stack.pop()

    def handle_data(self, value):
        for key in self.stack:
            self.text[key] = self.text.get(key, "") + value


def validate(data, ledger):
    errors = []
    if "不等同于 RFC、工作组采纳或 IETF 共识" not in data["ietf"]["intro"]:
        errors.append("I-D status boundary missing")
    if len(data["ietf"]["items"]) != 5:
        errors.append("Expected five dated I-D records")
    groups = {
        "ietf": data["ietf"]["items"],
        "activity": data["ietf"]["activities"],
        "security": data["security"]["items"],
        "works": data["works"],
        "pending": data["works"],
        "papers": data["works"],
    }
    for record in ledger["records"]:
        matches = [item for item in groups[record["section"]] if item.get("url") == record["url"]]
        if len(matches) != 1 or not record.get("evidence") or not record.get("role"):
            errors.append(f"Missing/ambiguous evidence mapping: {record['id']}")
            continue
        item = matches[0]
        if record["section"] == "ietf":
            if item.get("version") != record["version"] or item["status"] != f"Active individual I-D · {record['role']}":
                errors.append(f"Draft role/version mismatch: {record['id']}")
        elif record["section"] in {"activity", "security"}:
            if item.get("role") != record["role"]:
                errors.append(f"Contribution role mismatch: {record['id']}")
        if record["section"] == "security" and not record.get("credit"):
            errors.append(f"Finder credit missing: {record['id']}")
        if record["section"] == "pending" and item["type"] != "编制-标准（待发布）":
            errors.append(f"Comment-stage standard incorrectly published: {record['id']}")
    standard = [x for x in data["works"] if "T/CECC 58—2026" in x["title"]]
    if len(standard) != 1 or standard[0]["type"] != "编制-标准" or "效能" not in standard[0]["title"]:
        errors.append("Agent evaluation standard remains pending or misnamed")
    preprint = [x for x in data["works"] if x["title"].startswith("EarlyAttestationBleed:")]
    if len(preprint) != 1 or preprint[0]["type"] != "研究-预印本" or "非已确认录用论文" not in preprint[0].get("note", ""):
        errors.append("Preprint publication boundary missing")
    media = [x for x in data["works"] if "万字详解智能体2.0" in x["title"]]
    if not media or media[0]["type"] != "媒体-测评":
        errors.append("Media measurement role misclassified")
    return errors


def validate_rendered(data, ledger, html):
    errors = []
    page = Sections()
    page.feed(html)
    expected_sections = {"ietf": "about-ietf", "activity": "about-ietf", "security": "about-security", "works": "about-work-panel-published", "pending": "about-work-panel-inprogress", "papers": "research-papers"}
    for record in ledger["records"]:
        if record["url"] not in page.links:
            errors.append(f"Source link not rendered: {record['id']}")
        for item in {"ietf": data["ietf"]["items"], "activity": data["ietf"]["activities"], "security": data["security"]["items"], "works": data["works"], "pending": data["works"], "papers": data["works"]}[record["section"]]:
            if item.get("url") == record["url"]:
                rendered = page.text.get(expected_sections[record["section"]], "")
                for field in ("title", "note", "version", "role", "status", "date"):
                    if item.get(field) and item[field] not in rendered:
                        errors.append(f"Record {field} rendered in wrong panel or omitted: {record['id']}")
    if data["ietf"]["intro"] not in page.text.get("about-ietf", ""):
        errors.append("I-D boundary missing from rendered page")
    if data["security"]["intro"] not in page.text.get("about-security", ""):
        errors.append("Finder-selection boundary missing from rendered page")
    if "效能评估规范" in page.text.get("about-work-panel-inprogress", ""):
        errors.append("Published standard leaked into pending panel")
    if data["translation_note"] not in page.text.get("about-work-panel-translated", "") or data["translation_note"] in page.text.get("about-work-panel-published", ""):
        errors.append("Translation note in wrong panel")
    return errors


def main():
    data = yaml.safe_load((ROOT / "data/about.yaml").read_text())
    ledger = json.loads(LEDGER.read_text())
    errors = validate(data, ledger)
    bad_data = deepcopy(data)
    next(x for x in bad_data["works"] if "T/CECC 58—2026" in x["title"])["type"] = "编制-标准（待发布）"
    assert "Agent evaluation standard remains pending or misnamed" in validate(bad_data, ledger), "Negative control missed stale classification"
    bad_ledger = deepcopy(ledger)
    del next(x for x in bad_ledger["records"] if x["id"] == "CVE-2026-92701")["credit"]
    assert "Finder credit missing: CVE-2026-92701" in validate(data, bad_ledger), "Negative control missed absent credit"
    bad_data = deepcopy(data)
    next(x for x in bad_data["works"] if x["type"] == "研究-预印本")["type"] = "编写-书籍"
    assert "Preprint publication boundary missing" in validate(bad_data, ledger), "Negative control missed status inflation"
    html = (ROOT / "public/research/index.html").read_text()
    errors.extend(validate_rendered(data, ledger, html))
    bad_html = html.replace("不等同于 RFC、工作组采纳或 IETF 共识", "已发布国际标准")
    assert "I-D boundary missing from rendered page" in validate_rendered(data, ledger, bad_html), "Negative control missed removed rendered boundary"
    about = Sections()
    about.feed((ROOT / "public/about/index.html").read_text())
    if "/research/" not in about.links or "about-research-summary" not in about.text:
        errors.append("About lacks the new summary/Research link")
    if "about-work-panel-published" in about.text or "about-security" in about.text:
        errors.append("About still duplicates the full directory")
    for path in ("public/index.html", "public/about/index.html", "public/research/index.html"):
        parser = Sections()
        parser.feed((ROOT / path).read_text())
        if not {"/research/", "https://bluedog.website/research/"}.intersection(parser.links):
            errors.append(f"Research navigation missing from {path}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"PASS: {len(ledger['records'])} evidence mappings rendered in Research; About remains concise; 4 negative controls detected. Source entailment and visual review remain separate checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
