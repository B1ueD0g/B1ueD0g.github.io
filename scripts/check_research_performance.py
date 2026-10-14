#!/usr/bin/env python3
"""Require three Research Lighthouse runs within the existing 200 ms TBT budget."""
from __future__ import annotations
import argparse
import datetime
import json
import math
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


def check_reports(directory: Path) -> list[dict]:
    runs = []
    origins = set()
    for path in sorted(directory.glob("lhr-*.json")):
        data = json.loads(path.read_text())
        urls = [data.get("requestedUrl", ""), data.get("finalUrl", "")]
        urls.append(data.get("finalDisplayedUrl", urls[1]))
        if not any(isinstance(url, str) and urlsplit(url).path == "/research/" for url in urls):
            continue
        targets = []
        for url in urls:
            if not isinstance(url, str):
                raise ValueError(f"Invalid Research target: {path.name}")
            target = urlsplit(url)
            if (target.scheme not in ("http", "https") or target.hostname not in ("localhost", "127.0.0.1", "::1")
                    or target.path != "/research/" or target.query or target.fragment or target.username or target.password):
                raise ValueError(f"Unexpected Research target: {url}")
            targets.append((target.scheme, target.hostname, target.port or (443 if target.scheme == "https" else 80)))
        if len(set(targets)) != 1:
            raise ValueError(f"Research measurement changed origin: {path.name}")
        origins.add(targets[0])
        if data.get("runtimeError"):
            raise ValueError(f"Research Lighthouse failed: {data['runtimeError']}")
        audit = data.get("audits", {}).get("total-blocking-time", {})
        value = audit.get("numericValue")
        if (audit.get("scoreDisplayMode") != "numeric" or audit.get("numericUnit") != "millisecond"
                or audit.get("errorMessage") or isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value) or value < 0):
            raise ValueError(f"Missing valid Research TBT measurement: {path.name}")
        if value > 200:
            raise ValueError(f"Research TBT {value:.1f} ms exceeds 200 ms: {path.name}")
        if not isinstance(data.get("fetchTime"), str):
            raise ValueError(f"Missing Research measurement timestamp: {path.name}")
        timestamp = datetime.datetime.fromisoformat(data["fetchTime"].replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            raise ValueError(f"Research timestamp has no timezone: {path.name}")
        runs.append({"file": path.name, "fetchTime": timestamp.astimezone(datetime.timezone.utc).isoformat(), "tbt_ms": value})
    if len(runs) != 3 or len({run["fetchTime"] for run in runs}) != 3 or len(origins) != 1:
        raise ValueError("Need exactly three distinct Research Lighthouse runs from the same local origin")
    return runs


def self_test() -> None:
    with tempfile.TemporaryDirectory(prefix="research-tbt-fixture-") as temporary:
        directory = Path(temporary)
        def fixture(index=2, value=200):
            return {"requestedUrl": "http://localhost/research/", "finalUrl": "http://localhost/research/",
                    "finalDisplayedUrl": "http://localhost/research/", "fetchTime": f"2026-10-14T00:00:0{index}Z",
                    "audits": {"total-blocking-time": {"numericValue": value, "scoreDisplayMode": "numeric", "numericUnit": "millisecond"}}}
        for index, value in enumerate((0, 85, 200)):
            data = fixture(index, value)
            (directory / f"lhr-{index}.json").write_text(json.dumps(data))
        assert len(check_reports(directory)) == 3
        path = directory / "lhr-2.json"
        invalid = [fixture(value=bad) for bad in (201, -1, float("nan"), float("inf"), None, True, "0")]
        for field, value in (("scoreDisplayMode", "error"), ("scoreDisplayMode", "notApplicable"),
                             ("scoreDisplayMode", "manual"), ("numericUnit", "second"), ("errorMessage", "failed audit")):
            data = fixture(); data["audits"]["total-blocking-time"][field] = value; invalid.append(data)
        for field, value in (("runtimeError", {"code": "NO_FCP"}), ("finalUrl", "https://example.com/research/"),
                             ("requestedUrl", "http://localhost/other/"), ("fetchTime", "invalid"),
                             ("fetchTime", "2026-10-14T00:00:01Z"), ("fetchTime", "2026-10-14T01:00:01+01:00")):
            data = fixture(); data[field] = value; invalid.append(data)
        for data in invalid:
            path.write_text(json.dumps(data))
            try:
                check_reports(directory)
            except ValueError:
                pass
            else:
                raise AssertionError(f"Invalid TBT fixture accepted: {data!r}")
        path.unlink()
        try:
            check_reports(directory)
        except ValueError:
            pass
        else:
            raise AssertionError("Two-run fixture accepted")
    print("PASS: Research TBT gate rejects invalid values, audit states, units, targets, timestamps and incomplete runs")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports-dir", type=Path, default=Path(".lighthouseci"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        print(json.dumps({"research_tbt_limit_ms": 200, "runs": check_reports(args.reports_dir)}, indent=2))


if __name__ == "__main__":
    main()
