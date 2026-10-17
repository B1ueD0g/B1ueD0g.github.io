#!/usr/bin/env python3
"""Check the public portfolio against its dated, public-only source inventory."""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "docs/public-security-audit-2026-10-17.json"
REFRESH = ROOT / "docs/portfolio-refresh-2026-10-17.json"


class PortfolioHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections = []
        self.security_sources = []
        self.cve_links = []
        self.work_links = []
        self.security_text = []
        self.work_text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "section":
            self.sections.append(attrs.get("id", ""))
        if tag == "a":
            href = attrs.get("href", "")
            if "about-security" in self.sections:
                if "/security/advisories/" in href:
                    self.security_sources.append(href)
                if "about-cve-link" in attrs.get("class", "").split():
                    self.cve_links.append(href)
            if "about-work-panel-published" in self.sections:
                self.work_links.append(href)

    def handle_endtag(self, tag):
        if tag == "section" and self.sections:
            self.sections.pop()

    def handle_data(self, value):
        if "about-security" in self.sections:
            self.security_text.append(value)
        if "about-work-panel-published" in self.sections:
            self.work_text.append(value)


def validate(data, audit, refresh):
    errors = []
    records = audit["records"]
    items = data["security"]["items"]
    if Counter(x["url"] for x in items) != Counter(x["url"] for x in records):
        errors.append("Portfolio differs from the verified public inventory")
    if len({r["url"] for r in records}) != len(records):
        errors.append("Duplicate source in public inventory")
    sources = {r["url"]: r for r in records}
    for record in records:
        if record.get("state") != "published" or record.get("closed_at") or record.get("withdrawn_at"):
            errors.append("Inventory contains a non-public or withdrawn report")
        credit = record.get("credit", {})
        if credit != {"user": "B1ueD0g", "type": "finder", "state": "accepted"}:
            errors.append("Inventory lacks accepted personal Finder credit")
        if not record["url"].endswith("/" + record["ghsa_id"]) or not record.get("published_at"):
            errors.append("Advisory identity or publication evidence missing")
    for item in items:
        if item.get("state") != "published" or item.get("closed_at") or item.get("withdrawn_at"):
            errors.append("Non-public security item must not be in the portfolio")
        source = sources.get(item["url"])
        if source:
            expected = source.get("cve_id") or source["ghsa_id"]
            if item["title"].split(" · ")[0] != expected:
                errors.append("Advisory title identifier mismatch")
            cve_url = f"https://www.cve.org/CVERecord?id={source['cve_id']}" if source.get("cve_id") else None
            if item.get("cve_url") != cve_url:
                errors.append("CVE source mapping mismatch")
    media = refresh["media"]
    matches = [w for w in data["works"] if w.get("url") == media["url"]]
    if len(matches) != 1 or matches[0]["title"] != media["title"] or matches[0]["type"] != "媒体-访谈":
        errors.append("Desktop media interview entry missing or misclassified")
    if any(w.get("url") == media["mobile_url"] for w in data["works"]):
        errors.append("Mobile media URL should not be published")
    if media["journalist"] != "王俊" or media["role"] != "受访分析者":
        errors.append("Media interviewee and journalist roles were confused")
    return errors


def validate_html(data, refresh, html):
    page = PortfolioHTML()
    page.feed(html)
    public = [x for x in data["security"]["items"] if x.get("state") == "published" and not x.get("closed_at") and not x.get("withdrawn_at")]
    assert Counter(page.security_sources) == Counter(x["url"] for x in public), "Rendered public sources missing or duplicated"
    assert Counter(page.cve_links) == Counter(x["cve_url"] for x in public if x.get("cve_url")), "Official CVE links missing or duplicated"
    for item in public:
        assert item["title"].split(" · ")[0] in "".join(page.security_text)
    media = refresh["media"]
    assert page.work_links.count(media["url"]) == 2, "Interview title and open link must use the desktop URL"
    assert media["title"] in "".join(page.work_text) and "媒体-访谈" in "".join(page.work_text), "Interview omitted from the published Works panel"
    assert media["mobile_url"] not in html, "Mobile URL leaked into rendered page"


def check_real_visibility_fixture(data, refresh):
    """Build real Hugo output: a closed CVE and draft/withdrawn/closed GHSAs disappear."""
    fixture = deepcopy(data)
    cve = next(x for x in fixture["security"]["items"] if x.get("cve_url"))
    ghsas = [x for x in fixture["security"]["items"] if not x.get("cve_url")]
    cve["state"] = "closed"
    ghsas[0]["state"] = "draft"
    ghsas[1]["withdrawn_at"] = "2026-10-17T00:00:00Z"
    ghsas[2]["closed_at"] = "2026-10-17T00:00:00Z"
    excluded = [cve, *ghsas[:3]]
    scratch = Path.home() / ".codex/work"
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="blog-public-policy-", dir=scratch) as temp:
        temp = Path(temp)
        shutil.copytree(ROOT / "data", temp / "data")
        (temp / "data/about.yaml").write_text(yaml.safe_dump(fixture, allow_unicode=True, sort_keys=False))
        config = temp / "fixture.json"
        config.write_text(json.dumps({"dataDir": str(temp / "data"), "resourceDir": str(temp / "resources"), "cacheDir": str(temp / "cache")}))
        subprocess.run(["hugo", "--config", f"{ROOT / 'hugo.toml'},{config}", "--destination", str(temp / "public"), "--minify", "--quiet", "--noBuildLock"], cwd=ROOT, check=True, timeout=60)
        html = (temp / "public/research/index.html").read_text()
        validate_html(fixture, refresh, html)
        for item in excluded:
            assert item["url"] not in html, "Hugo leaked a non-public report"
            assert item["title"].split(" · ")[0] not in html, "Hugo leaked a non-public identifier"
            if item.get("cve_url"):
                assert item["cve_url"] not in html, "Hugo leaked a closed CVE official link"


def main():
    data = yaml.safe_load((ROOT / "data/about.yaml").read_text())
    audit = json.loads(AUDIT.read_text())
    refresh = json.loads(REFRESH.read_text())
    errors = validate(data, audit, refresh)
    if errors:
        raise SystemExit("\n".join(errors))
    negative_count = 0
    for changes in ({"state": "closed"}, {"state": "draft"}, {"state": None}, {"withdrawn_at": "2026-10-17T00:00:00Z"}, {"closed_at": "2026-10-17T00:00:00Z"}):
        bad = deepcopy(data)
        bad["security"]["items"][0].update(changes)
        assert "Non-public security item must not be in the portfolio" in validate(bad, audit, refresh)
        negative_count += 1
    bad = deepcopy(audit)
    bad["records"][0]["credit"]["state"] = "pending"
    assert "Inventory lacks accepted personal Finder credit" in validate(data, bad, refresh)
    negative_count += 1
    bad = deepcopy(data)
    bad["security"]["items"].append(deepcopy(bad["security"]["items"][0]))
    assert "Portfolio differs from the verified public inventory" in validate(bad, audit, refresh)
    negative_count += 1
    bad = deepcopy(data)
    next(w for w in bad["works"] if w.get("url") == refresh["media"]["url"])["type"] = "编写-文章"
    assert "Desktop media interview entry missing or misclassified" in validate(bad, audit, refresh)
    negative_count += 1
    validate_html(data, refresh, (ROOT / "public/research/index.html").read_text())
    check_real_visibility_fixture(data, refresh)
    print(f"PASS: {len(audit['records'])} public credited advisories; canonical interview; {negative_count} rejected negative controls; real Hugo closed/draft/withdrawn visibility fixture.")


if __name__ == "__main__":
    main()
