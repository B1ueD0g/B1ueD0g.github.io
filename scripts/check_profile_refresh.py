#!/usr/bin/env python3
"""Regression gate for the dated public-profile refresh; not a source-truth oracle."""
from __future__ import annotations

from copy import deepcopy
from html.parser import HTMLParser
import json
from pathlib import Path
import re
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
        self.section_links = {}
        self.cve_links = set()
        self.featured_cards = 0
        self.advisories = 0
        self.advisory_links = []
        self.vendor_groups = []
        self.strong_text = None
        self.bold_paper_names = []
        self.doi_text = None
        self.doi_href = None
        self.paper_doi_links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if "security-featured-card" in classes:
            self.featured_cards += 1
        if "security-advisory" in classes:
            self.advisories += 1
        if tag == "details" and "security-vendor-group" in classes:
            self.vendor_groups.append("open" in attrs)
        if tag == "section":
            self.stack.append(attrs.get("id", ""))
        if tag == "strong" and "research-papers" in self.stack:
            self.strong_text = ""
        if tag == "a":
            href = attrs.get("href", "")
            if "security-advisory" in classes:
                self.advisory_links.append(href)
            if "research-doi-link" in classes and "research-papers" in self.stack:
                self.doi_text = ""
                self.doi_href = href
            self.links.add(href)
            for key in self.stack:
                self.section_links.setdefault(key, set()).add(href)
            if "about-cve-link" in attrs.get("class", "").split():
                self.cve_links.add(href)

    def handle_endtag(self, tag):
        if tag == "a" and self.doi_text is not None:
            self.paper_doi_links.append((self.doi_href, self.doi_text))
            self.doi_text = None
            self.doi_href = None
        if tag == "strong" and self.strong_text is not None:
            if self.strong_text.casefold() in {"卜宋博", "songbo bu"}:
                self.bold_paper_names.append(self.strong_text)
            self.strong_text = None
        if tag == "section" and self.stack:
            self.stack.pop()

    def handle_data(self, value):
        if self.doi_text is not None:
            self.doi_text += value
        if self.strong_text is not None:
            self.strong_text += value
        for key in self.stack:
            self.text[key] = self.text.get(key, "") + value


def validate(data, ledger):
    errors = []
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
        matches = [item for item in groups[record["section"]] if (item.get("url") == record["url"] if record.get("url") else item["title"] == record.get("title"))]
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
        if record["section"] == "papers" and record.get("type") and item["type"] != record["type"]:
            errors.append(f"Publication type mismatch: {record['id']}")
        if record["section"] == "papers" and item.get("doi") != record.get("doi"):
            errors.append(f"Paper DOI evidence mismatch: {record['id']}")
    for item in data["works"]:
        if item["type"].startswith("研究-") and item.get("doi") and not re.fullmatch(r"10\.\d{4,9}/\S+", item["doi"]):
            errors.append(f"Invalid DOI syntax: {item['title']}")
    security_records = {r["url"]: r for r in ledger["records"] if r["section"] == "security"}
    for item in data["security"]["items"]:
        record = security_records.get(item["url"], {})
        if not record.get("credit") or not record.get("evidence"):
            errors.append(f"Security entry lacks Finder evidence: {item['title']}")
    security_urls = [item["url"] for item in data["security"]["items"]]
    if len(security_urls) != len(set(security_urls)):
        errors.append("Duplicate CVE/GHSA source in security inventory")
    for promotion in ledger.get("security_promotions", []):
        matches = [item for item in data["security"]["items"] if item["url"] == promotion["url"]]
        record = security_records.get(promotion["url"], {})
        if len(matches) != 1 or matches[0]["title"].split(" · ")[0] != promotion["cve"] or matches[0].get("cve_url") != promotion["cve_url"]:
            errors.append(f"CVE promotion mapping mismatch: {promotion['cve']}")
        if record.get("id") != promotion["cve"] or record.get("ghsa_id") != promotion["ghsa"] or record.get("state") != "PUBLISHED" or promotion.get("credited_user") != "B1ueD0g" or promotion.get("credit_type") != "finder" or promotion.get("credit_state") != "accepted":
            errors.append(f"CVE promotion lacks published Finder evidence: {promotion['cve']}")
    for record in ledger["standard_identifiers"]:
        matches = [item for item in data["works"] if item.get("url") == record["url"]]
        expected_title = f"{record['number']}《{record['name']}》"
        if len(matches) != 1 or matches[0]["title"] != expected_title or matches[0]["type"] != "编制-标准":
            errors.append(f"Published standard identifier mismatch: {record['number']}")
    standard = [x for x in data["works"] if "T/CECC 58—2026" in x["title"]]
    if len(standard) != 1 or standard[0]["type"] != "编制-标准" or "效能" not in standard[0]["title"]:
        errors.append("Agent evaluation standard remains pending or misnamed")
    preprint = [x for x in data["works"] if x["title"].startswith("EarlyAttestationBleed:")]
    if len(preprint) != 1 or preprint[0]["type"] != "研究-预印本" or "Preprint" not in preprint[0].get("note", ""):
        errors.append("Preprint publication boundary missing")
    media = [x for x in data["works"] if "万字详解智能体2.0" in x["title"]]
    if not media or media[0]["type"] != "媒体-测评":
        errors.append("Media measurement role misclassified")
    return errors


def validate_rendered(data, ledger, html):
    errors = []
    page = Sections()
    page.feed(html)
    paper_count = sum(item["type"].startswith("研究-") for item in data["works"])
    if len(page.bold_paper_names) != paper_count:
        errors.append("Personal author credit not bold in every paper")
    expected_dois = [(f"https://doi.org/{item['doi']}", item["doi"]) for item in data["works"] if item["type"].startswith("研究-") and item.get("doi")]
    if sorted(page.paper_doi_links) != sorted(expected_dois):
        errors.append("Paper DOI links missing, duplicated or mislabeled")
    expected_sections = {"ietf": "about-ietf", "activity": "about-ietf", "security": "about-security", "works": "about-work-panel-published", "pending": "about-work-panel-inprogress", "papers": "research-papers"}
    for record in ledger["records"]:
        if record.get("url") and record["url"] not in page.links:
            errors.append(f"Source link not rendered: {record['id']}")
        for item in {"ietf": data["ietf"]["items"], "activity": data["ietf"]["activities"], "security": data["security"]["items"], "works": data["works"], "pending": data["works"], "papers": data["works"]}[record["section"]]:
            if (item.get("url") == record["url"] if record.get("url") else item["title"] == record.get("title")):
                rendered = page.text.get(expected_sections[record["section"]], "")
                # User-selected compact lists show titles; source/role metadata stays in the ledger.
                fields = ("title",) if record["section"] in {"activity", "security"} else ("title", "note", "version", "role", "status", "date")
                for field in fields:
                    values = item.get(field, "").split(" · ") if field == "title" and record["section"] == "security" else [item.get(field, "")]
                    if any(value and value not in rendered for value in values):
                        errors.append(f"Record {field} rendered in wrong panel or omitted: {record['id']}")
                if record["section"] in {"activity", "security"} and item.get("note") and item["note"] in rendered:
                    errors.append(f"Requested detail paragraph still rendered: {record['id']}")
                if item.get("cve_url") and (item["cve_url"] not in page.cve_links or item["cve_url"] not in page.section_links.get("about-security", set())):
                    errors.append(f"Official CVE link missing: {record['id']}")
    featured = sum(bool(item.get("cve_url")) for item in data["security"]["items"])
    if page.featured_cards != featured or page.advisories != len(data["security"]["items"]) - featured:
        errors.append("Security featured cards/advisory directory mismatch")
    for promotion in ledger.get("security_promotions", []):
        if promotion["url"] in page.advisory_links:
            errors.append(f"Promoted CVE remains in GHSA directory: {promotion['cve']}")
    if len(page.vendor_groups) != 4 or any(page.vendor_groups):
        errors.append("Vendor directory must be four initially collapsed groups")
    if data["ietf"]["intro"] not in page.text.get("about-ietf", ""):
        errors.append("IETF introduction missing from rendered page")
    if data["security"]["intro"] not in page.text.get("about-security", ""):
        errors.append("Security introduction missing from rendered page")
    published = page.text.get("about-work-panel-published", "")
    for record in ledger["standard_identifiers"]:
        if f"{record['number']}《{record['name']}》" not in published:
            errors.append(f"Standard identifier not rendered: {record['number']}")
    for removed in ("CSA 大中华区署名文章，", "不是该报道的记者署名", "起草人；中国电子商会发布。", "不等同于 RFC", "不是该草案的作者署名", "不将团队全部发现计作个人成果", "非已确认录用论文", "不展示未公开投稿状态", "最终起草署名待核验"):
        if removed in " ".join(page.text.values()):
            errors.append(f"Internal audit wording leaked into portfolio: {removed}")
    for item in data["works"]:
        if item["type"] in {"编制-标准", "编写-文章", "媒体-测评"} and item.get("note"):
            errors.append(f"Requested published-work note restored: {item['title']}")
        if item["type"].startswith("研究-") and item["title"] in published:
            errors.append(f"Paper duplicated in Standards and Works: {item['title']}")
    if "效能评估规范" in page.text.get("about-work-panel-inprogress", ""):
        errors.append("Published standard leaked into pending panel")
    if data["translation_note"] not in page.text.get("about-work-panel-translated", "") or data["translation_note"] in page.text.get("about-work-panel-published", ""):
        errors.append("Translation note in wrong panel")
    return errors


def validate_about(data, html):
    errors = []
    about = Sections()
    about.feed(html)
    if "about-research-summary" in about.text or "#about-research-summary" in about.links:
        errors.append("Removed Selected Research summary restored on About")
    if "about-work-panel-published" in about.text or "about-security" in about.text:
        errors.append("About still duplicates the full directory")
    honors = about.text.get("about-honors", "")
    if any(value in honors for value in ("CVE-2022-1407", "CVE-2022-1408", "CVE-2022-1409", "CNVD-2023-77801")):
        errors.append("Vulnerability identifiers still displayed as honors")
    for key, section in (("certifications", "about-certifications"), ("honors", "about-honors")):
        if any(item not in about.text.get(section, "") for item in data[key]):
            errors.append(f"Remaining {key} record omitted")
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
    assert "Personal author credit not bold in every paper" in validate_rendered(data, ledger, html.replace("<strong>卜宋博</strong>", "卜宋博", 1)), "Negative control missed lost author emphasis"
    bad_html = html.replace("Active individual I-D · Author", "Published RFC · Author")
    assert "Record status rendered in wrong panel or omitted: principal-binding" in validate_rendered(data, ledger, bad_html), "Negative control missed inflated rendered draft status"
    cve = data["security"]["items"][0]["cve_url"]
    assert "Official CVE link missing: CVE-2026-92701" in validate_rendered(data, ledger, html.replace(cve, "#")), "Negative control missed missing CVE link"
    bad_html = html.replace("</h2>", "</h2><p>不将团队全部发现计作个人成果</p>", 1)
    assert any("Internal audit wording" in e for e in validate_rendered(data, ledger, bad_html)), "Negative control missed audit prose"
    bad_data = deepcopy(data)
    next(x for x in bad_data["works"] if "T/CCF 0010" in x["title"])["title"] = "零信任数据隐身协议"
    assert "Published standard identifier mismatch: T/CCF 0010—2026" in validate(bad_data, ledger), "Negative control missed standard identifier loss"
    bad_html = html.replace('class=security-vendor-group', 'open class=security-vendor-group').replace('class="security-vendor-group"', 'open class="security-vendor-group"')
    assert "Vendor directory must be four initially collapsed groups" in validate_rendered(data, ledger, bad_html), "Negative control missed expanded long directory"
    bad_data = deepcopy(data)
    next(x for x in bad_data["works"] if x["title"].startswith("基于AIoT"))["type"] = "研究-预印本"
    assert "Publication type mismatch: paper-aiot-mastitis" in validate(bad_data, ledger), "Negative control missed changed publication type"
    bad_data = deepcopy(data)
    next(x for x in bad_data["works"] if x["title"].startswith("基于AIoT"))["doi"] = "10.14088/incorrect"
    assert "Paper DOI evidence mismatch: paper-aiot-mastitis" in validate(bad_data, ledger), "Negative control missed wrong DOI mapping"
    doi_url = f"https://doi.org/{next(x for x in data['works'] if x.get('doi'))['doi']}"
    assert "Paper DOI links missing, duplicated or mislabeled" in validate_rendered(data, ledger, html.replace(doi_url, "#", 1)), "Negative control missed broken DOI href"
    bad_html = html.replace('class=research-doi-link', 'class=removed-doi-link', 1).replace('class="research-doi-link"', 'class="removed-doi-link"', 1)
    assert "Paper DOI links missing, duplicated or mislabeled" in validate_rendered(data, ledger, bad_html), "Negative control missed omitted DOI anchor"
    promotions = ledger.get("security_promotions", [])
    if promotions:
        promotion = promotions[0]
        bad_data = deepcopy(data)
        duplicate = deepcopy(next(x for x in bad_data["security"]["items"] if x["url"] == promotion["url"]))
        duplicate["title"] = f"{promotion['ghsa']} · duplicate"
        duplicate.pop("cve_url")
        bad_data["security"]["items"].append(duplicate)
        assert "Duplicate CVE/GHSA source in security inventory" in validate(bad_data, ledger), "Negative control missed restored GHSA duplicate"
        bad_data = deepcopy(data)
        next(x for x in bad_data["security"]["items"] if x["url"] == promotion["url"])["cve_url"] = "https://www.cve.org/CVERecord?id=CVE-2026-108269"
        assert f"CVE promotion mapping mismatch: {promotion['cve']}" in validate(bad_data, ledger), "Negative control missed swapped CVE URL"
        bad_html = html + f'<a class="security-advisory" href="{promotion["url"]}">{promotion["ghsa"]}</a>'
        assert f"Promoted CVE remains in GHSA directory: {promotion['cve']}" in validate_rendered(data, ledger, bad_html), "Negative control missed rendered GHSA duplicate"
    about_html = (ROOT / "public/about/index.html").read_text()
    errors.extend(validate_about(data, about_html))
    assert "Removed Selected Research summary restored on About" in validate_about(data, about_html + '<section id="about-research-summary">Selected Research</section>'), "Negative control missed restored summary"
    assert "Vulnerability identifiers still displayed as honors" in validate_about(data, about_html + '<section id="about-honors">CVE-2022-1407 CNVD-2023-77801</section>'), "Negative control missed misplaced vulnerability identifiers"
    for path in ("public/index.html", "public/about/index.html", "public/research/index.html"):
        parser = Sections()
        parser.feed((ROOT / path).read_text())
        if not {"/research/", "https://bluedog.website/research/"}.intersection(parser.links):
            errors.append(f"Research navigation missing from {path}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    doi_count = sum(bool(item.get("doi")) for item in data["works"] if item["type"].startswith("研究-"))
    print(f"PASS: {len(ledger['records'])} evidence mappings; {doi_count} clickable paper DOIs, compact portfolio, 5 standard identifiers, featured CVEs, collapsed vendor directory, publication types, author emphasis and focused About page; {15 + (3 if promotions else 0)} negative controls detected. Source entailment and visual review remain separate checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
