#!/usr/bin/env python3
"""Keep the Pages link gate strict except for a verified runner-specific 504."""

import argparse
import json
from pathlib import Path


# The three official records respond outside the GitHub runner. The scheduled
# audit still checks them with the shared strict Lychee settings.
STANDARDS_504_URLS = {
    "https://www.ttbz.org.cn/standardDetail.html?id=1c2fa5873f1846fbadc7d12c160c0015",
    "https://www.ttbz.org.cn/standardDetail.html?id=g41m52bnae65ralm3nfk6efvbubfrd3",
    "https://www.ttbz.org.cn/standardDetail.html?id=8yqjplnt5uczvv55t0u7jjoprfqtbda",
}


def classify(report, exit_code):
    if exit_code not in (0, 2):
        raise ValueError(f"unexpected Lychee exit code {exit_code}")
    if report["detailed_stats"] is not True or report["successful"] < 1:
        raise ValueError("Lychee did not report a completed site scan")

    failures = []
    deferred = set()
    for counter, map_name in (("errors", "error_map"), ("timeouts", "timeout_map")):
        records = [item for items in report[map_name].values() for item in items]
        if len(records) != report[counter]:
            raise ValueError(f"incomplete Lychee {map_name}")
        for record in records:
            url = record["url"]
            code = record["status"].get("code")
            if counter == "errors" and code == 504 and url in STANDARDS_504_URLS:
                deferred.add(url)
            else:
                failures.append((url, code))

    if (exit_code == 2) != bool(report["errors"] + report["timeouts"]):
        raise ValueError("Lychee exit code and report disagree")
    return failures, deferred


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("exit_code", type=int)
    args = parser.parse_args()
    try:
        failures, deferred = classify(json.loads(args.report.read_text()), args.exit_code)
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        print(f"Link gate could not validate the Lychee scan: {error}")
        return 1

    for url in sorted(deferred):
        print(f"::warning::Official standard returned HTTP 504 from GitHub Actions. "
              f"The separate link audit still checks {url}")
    for url, code in failures:
        print(f"Blocking link result: {url!r} ({code or 'request failed'})")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
