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
AUDIT = ROOT / "docs/public-security-audit-2026-11-01.json"
LEGACY_AUDIT = ROOT / "docs/public-security-audit-2026-10-17.json"
REFRESH = ROOT / "docs/portfolio-refresh-2026-10-17.json"
EXPECTED_CVES = {
    "CVE-2026-92701", "CVE-2026-92702", "CVE-2026-109358",
    *(f"CVE-2026-{108265 + offset}" for offset in range(5)),
}
NEW_GHSAS = {
    "GHSA-qp28-6j56-j83v", "GHSA-j83r-456j-5qj2", "GHSA-58mm-x75f-qv9h",
    "GHSA-83wg-c3jj-cf77", "GHSA-2w6f-8xrm-f9xw", "GHSA-gh56-wjpj-xppq",
    "GHSA-4pqf-h3v4-fq3c", "GHSA-4456-rr46-r7v6", "GHSA-qrvp-grrm-qpqv",
}
IETF_UPDATES = {
    "https://datatracker.ietf.org/doc/draft-bu-agentproto-security-principal-binding/": "-08 · 2026-10-13",
    "https://datatracker.ietf.org/doc/draft-intra-handshake-fail/": "-58 · 2026-10-28",
}
PENDING_STANDARDS = {
    "零信任可信接口规范",
    "《医疗人工智能应用 数据安全与隐私保护规范》-中国电子商会",
    "《人工智能生成内容 合规管理指南》-中国电子商会",
    "大模型驱动的安全运营工具技术要求-信通院",
}


class PortfolioHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.sections = []
        self.security_sources = []
        self.cve_links = []
        self.work_links = []
        self.security_text = []
        self.work_text = []
        self.pending_work_text = []
        self.ietf_entries = []
        self._ietf_link = None
        self._ietf_text = []

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
            if "about-ietf" in self.sections and "about-ietf-item" in attrs.get("class", "").split():
                self._ietf_link = href
                self._ietf_text = []

    def handle_endtag(self, tag):
        if tag == "a" and self._ietf_link:
            self.ietf_entries.append((self._ietf_link, "".join(self._ietf_text)))
            self._ietf_link = None
            self._ietf_text = []
        if tag == "section" and self.sections:
            self.sections.pop()

    def handle_data(self, value):
        if "about-security" in self.sections:
            self.security_text.append(value)
        if "about-work-panel-published" in self.sections:
            self.work_text.append(value)
        if "about-work-panel-inprogress" in self.sections:
            self.pending_work_text.append(value)
        if self._ietf_link:
            self._ietf_text.append(value)


def validate(data, audit, refresh):
    errors = []
    records = audit["records"]
    items = data["security"]["items"]
    if len(records) != 39 or sum(bool(r.get("cve_id")) for r in records) != 8 or sum(not r.get("cve_id") for r in records) != 31:
        errors.append("Wrong current inventory counts: expected 39 public, 8 CVE, 31 GHSA-only")
    if {r["cve_id"] for r in records if r.get("cve_id")} != EXPECTED_CVES:
        errors.append("Wrong current CVE identifier set")
    new_records = [r for r in records if r["ghsa_id"] in NEW_GHSAS]
    if len(new_records) != 9 or any(r.get("cve_id") or r["repo"] != "Privasys/enclave-os-virtual" for r in new_records):
        errors.append("Missing or misclassified newly public GHSA records")
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
    ietf = {x["url"]: x for x in data["ietf"]["items"]}
    for url, version in IETF_UPDATES.items():
        if ietf.get(url, {}).get("version") != version:
            errors.append("IETF draft revision is stale or mismatched")
    if len(data["ietf"]["items"]) != 5 or len(ietf) != 5 or any(not x.get("status", "").startswith("Active individual I-D") for x in ietf.values()):
        errors.append("Individual Internet-Drafts must not be promoted to formal standards")
    pending = [w["title"] for w in data["works"] if w["type"] == "编制-标准（待发布）"]
    if len(pending) != 4 or set(pending) != PENDING_STANDARDS:
        errors.append("Pending group-standard classification changed without release evidence")
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
    for url, version in IETF_UPDATES.items():
        matches = [text for href, text in page.ietf_entries if href == url]
        assert len(matches) == 1 and version in matches[0], "Rendered IETF revision is missing or assigned to the wrong draft"
        assert "Active individual I-D" in matches[0], "Draft publication status was overstated"
    for title in PENDING_STANDARDS:
        assert title in "".join(page.pending_work_text), "Pending standard omitted from the in-progress panel"
        assert title not in "".join(page.work_text), "Pending standard leaked into the published panel"


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
    legacy_audit = json.loads(LEGACY_AUDIT.read_text())
    assert "Wrong current inventory counts: expected 39 public, 8 CVE, 31 GHSA-only" in validate(data, legacy_audit, refresh)
    negative_count += 1
    legacy_data = deepcopy(data)
    old_sources = {r["url"]: r for r in legacy_audit["records"]}
    legacy_data["security"]["items"] = [x for x in legacy_data["security"]["items"] if x["url"] in old_sources]
    for item in legacy_data["security"]["items"]:
        old = old_sources[item["url"]]
        item["title"] = old["display_title"]
        if old.get("cve_id"):
            item["cve_url"] = f"https://www.cve.org/CVERecord?id={old['cve_id']}"
        else:
            item.pop("cve_url", None)
    assert "Portfolio differs from the verified public inventory" in validate(legacy_data, audit, refresh)
    negative_count += 1
    bad = deepcopy(data)
    contrast = next(x for x in bad["security"]["items"] if x["url"].endswith("GHSA-376m-h37w-4rvq"))
    contrast["title"] = "GHSA-376m-h37w-4rvq · Contrast 权限配置"
    contrast.pop("cve_url", None)
    assert "CVE source mapping mismatch" in validate(bad, audit, refresh)
    negative_count += 1
    bad = deepcopy(data)
    bad["ietf"]["items"][0]["version"] = "-07 · 2026-09-15"
    assert "IETF draft revision is stale or mismatched" in validate(bad, audit, refresh)
    negative_count += 1
    bad = deepcopy(data)
    next(w for w in bad["works"] if w["title"] in PENDING_STANDARDS)["type"] = "编制-标准"
    assert "Pending group-standard classification changed without release evidence" in validate(bad, audit, refresh)
    negative_count += 1
    validate_html(data, refresh, (ROOT / "public/research/index.html").read_text())
    check_real_visibility_fixture(data, refresh)
    print(f"PASS: {len(audit['records'])} public credited advisories (8 CVE, 31 GHSA-only); current IETF revisions and pending standards; canonical interview; {negative_count} rejected negative controls; real Hugo closed/draft/withdrawn visibility fixture.")


if __name__ == "__main__":
    main()
