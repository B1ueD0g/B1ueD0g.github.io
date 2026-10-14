#!/usr/bin/env python3
"""Exercise the real IndexNow functions against a bounded local HTTP fixture."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import re
import sys
import tempfile
import threading
import tomllib
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("submit_indexnow", ROOT / "scripts/submit_indexnow.py")
indexnow = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(indexnow)
KEY = "local-indexnow-key-20261014"


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def respond(self, code, body=b"", content_type="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.server.events.append(("GET", self.path))
        if self.path == "/bad-key.txt":
            return self.respond(200, b"wrong-public-key")
        if self.path == "/bom-key.txt":
            return self.respond(200, b"\xef\xbb\xbf" + KEY.encode())
        if self.path == "/invalid-utf8.txt":
            return self.respond(200, b"\xff\xfe")
        if self.path == "/missing-key.txt":
            return self.respond(404, b"key file missing")
        if self.path == "/retry-key.txt" and not self.server.retried:
            self.server.retried = True
            return self.respond(404, b"edge has not published key yet")
        if self.path == "/redirect-key.txt":
            self.send_response(302)
            self.send_header("Location", f"http://localhost:{self.server.server_port}/key.txt")
            self.end_headers()
            return
        self.respond(200, (KEY + "\n").encode())

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        payload = json.loads(body)
        self.server.events.append(("POST", self.path, self.headers["Content-Type"], payload))
        if self.path == "/submit/disconnect":
            self.close_connection = True
            return
        code = int(self.path.rsplit("/", 1)[-1])
        error = {"errorCode": "UserForbiddedToAccessSite", "message": "Please verify the site using the key"}
        self.respond(code, b"" if code == 204 else json.dumps(error if code >= 400 else {"received": True}).encode(), "application/json")


def job(text, name):
    match = re.search(rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [A-Za-z_-]+:\n|\Z)", text)
    if not match:
        raise AssertionError(f"Workflow job missing: {name}")
    return match.group(1)


class ReleaseIntegrations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
        cls.server.events = []
        cls.server.retried = False
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"
        cls.temp = tempfile.TemporaryDirectory(prefix="bluedog-indexnow-")
        cls.sitemap = Path(cls.temp.name) / "sitemap.xml"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join(timeout=2)
        cls.temp.cleanup()

    def setUp(self):
        self.server.events.clear()
        self.server.retried = False
        self.write_sitemap([self.origin + "/article/"])

    def write_sitemap(self, urls):
        import xml.etree.ElementTree as ET
        root = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
        for url in urls:
            ET.SubElement(ET.SubElement(root, "url"), "loc").text = url
        self.sitemap.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True))

    def run_cli(self, status=200, key_path="/key.txt", *extra):
        stdout, stderr = io.StringIO(), io.StringIO()
        argv = ["--sitemap", str(self.sitemap), "--host", "127.0.0.1", "--key", KEY,
                "--key-location", self.origin + key_path, "--endpoint", self.origin + f"/submit/{status}",
                "--key-check-attempts", "1", "--key-check-delay", "0", *extra]
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = indexnow.main(argv)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_accepted_statuses_and_real_payload(self):
        for status in (200, 202):
            with self.subTest(status=status):
                self.server.events.clear()
                code, stdout, stderr = self.run_cli(status)
                self.assertEqual(code, 0, stderr)
                self.assertIn(f"HTTP {status}", stdout)
                self.assertEqual("key validation pending" in stdout, status == 202)
                self.assertIn("does not confirm crawling or indexing", stdout)
                self.assertEqual(self.server.events[0], ("GET", "/key.txt"))
                posts = [event for event in self.server.events if event[0] == "POST"]
                self.assertEqual(len(posts), 1)
                self.assertEqual(posts[0][2], "application/json; charset=utf-8")
                self.assertEqual(posts[0][3], {"host": "127.0.0.1", "key": KEY,
                    "keyLocation": self.origin + "/key.txt", "urlList": [self.origin + "/article/"]})

    def test_http_errors_remain_failures_with_response_body(self):
        for status in (403, 422, 429, 500, 204):
            with self.subTest(status=status):
                self.server.events.clear()
                code, stdout, stderr = self.run_cli(status)
                self.assertEqual(code, 1)
                self.assertIn(f"HTTP {status}", stderr)
                self.assertNotIn("notification receipt", stdout)
                if status != 204:
                    self.assertIn("UserForbiddedToAccessSite", stderr)
                self.assertEqual(len([event for event in self.server.events if event[0] == "POST"]), 1)

    def test_transport_failure_is_not_a_receipt(self):
        code, stdout, stderr = self.run_cli("disconnect")
        self.assertEqual(code, 1)
        self.assertIn("IndexNow POST", stderr)
        self.assertIn("failed", stderr)
        self.assertNotIn("notification receipt", stdout)

    def test_bad_public_key_prevents_all_post_requests(self):
        for key_path, expected in [("/bad-key.txt", "does not match"), ("/bom-key.txt", "BOM"),
                                   ("/invalid-utf8.txt", "not UTF-8"), ("/missing-key.txt", "HTTP 404"),
                                   ("/redirect-key.txt", "different host")]:
            with self.subTest(key_path=key_path):
                self.server.events.clear()
                code, _stdout, stderr = self.run_cli(200, key_path)
                self.assertEqual(code, 1)
                self.assertIn(expected, stderr)
                self.assertFalse(any(event[0] == "POST" for event in self.server.events))

    def test_invalid_host_key_and_url_scope_are_rejected_before_network(self):
        valid = ("127.0.0.1", KEY, self.origin + "/key.txt", [self.origin + "/article/"])
        invalid = [
            ("https://127.0.0.1", *valid[1:]),
            ("127.0.0.1", "short", *valid[2:]),
            ("127.0.0.1", KEY, "https://other.example/key.txt", valid[3]),
            (*valid[:3], ["https://other.example/article/"]),
            (*valid[:3], [self.origin + "/未编码/"]),
            ("127.0.0.1", KEY, self.origin + "/catalog/key.txt", [self.origin + "/outside/"]),
            ("127.0.0.1", KEY, self.origin + "/catalog/key.txt", [self.origin + "/catalog/%2e%2e/outside/"]),
        ]
        for case in invalid:
            with self.subTest(case=case):
                with self.assertRaises(ValueError):
                    indexnow.validate_submission(*case)
        self.assertEqual(self.server.events, [])

    def test_cli_scope_error_and_empty_sitemap_are_nonzero(self):
        for urls, expected in [(["https://other.example/article/"], "different host"), ([], "No URLs")]:
            self.write_sitemap(urls)
            code, _stdout, stderr = self.run_cli()
            self.assertEqual(code, 1)
            self.assertIn(expected, stderr)
            self.assertEqual(self.server.events, [])

    def test_sitemap_deduplication_and_index_rejection(self):
        self.write_sitemap([self.origin + "/article/", self.origin + "/article/"])
        self.assertEqual(indexnow.parse_sitemap(self.sitemap), [self.origin + "/article/"])
        self.sitemap.write_text('<sitemapindex><sitemap><loc>https://example.com/sitemap.xml</loc></sitemap></sitemapindex>')
        with self.assertRaisesRegex(ValueError, "not a sitemap index"):
            indexnow.parse_sitemap(self.sitemap)

    def test_dry_run_and_key_only_never_submit(self):
        code, stdout, stderr = self.run_cli(200, "/key.txt", "--dry-run")
        self.assertEqual(code, 0, stderr)
        self.assertIn("no network request", stdout)
        self.assertEqual(self.server.events, [])
        code, stdout, stderr = self.run_cli(200, "/key.txt", "--check-key-only")
        self.assertEqual(code, 0, stderr)
        self.assertIn("no URLs submitted", stdout)
        self.assertEqual(self.server.events, [("GET", "/key.txt")])

    def test_bounded_key_retry_waits_for_publication(self):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            indexnow.preflight_key(self.origin + "/retry-key.txt", KEY, 2, 2, 0)
        self.assertEqual(self.server.events, [("GET", "/retry-key.txt"), ("GET", "/retry-key.txt")])

    def test_batch_limit_and_failure_do_not_skip_to_next_batch(self):
        self.write_sitemap([self.origin + "/one/", self.origin + "/two/"])
        code, _stdout, stderr = self.run_cli(403, "/key.txt", "--batch-size", "1")
        self.assertEqual(code, 1)
        self.assertIn("HTTP 403", stderr)
        self.assertEqual(len([event for event in self.server.events if event[0] == "POST"]), 1)

    def test_pinned_lychee_and_post_deployment_wiring(self):
        config = tomllib.loads((ROOT / ".lychee.toml").read_text())
        self.assertEqual(config["verbose"], "info")
        for filename in ("hugo.yml", "link-check.yml"):
            text = (ROOT / ".github/workflows" / filename).read_text()
            actions = re.findall(r"lycheeverse/lychee-action@v2\n\s+with:\n\s+lycheeVersion:\s*(\S+)", text)
            self.assertEqual(actions, ["v0.24.2"], filename)
        text = (ROOT / ".github/workflows/hugo.yml").read_text()
        build, notification = job(text, "build"), job(text, "indexnow")
        self.assertNotIn("scripts/submit_indexnow.py", build)
        self.assertIn("needs: deploy", notification)
        self.assertNotIn("continue-on-error", notification)
        self.assertIn("permissions:\n      contents: read", notification)
        self.assertIn("name: indexnow-sitemap\n          path: public/sitemap.xml", build)
        self.assertIn("if-no-files-found: error", build)
        self.assertIn("name: indexnow-sitemap\n          path: public", notification)
        self.assertIn("--sitemap public/sitemap.xml", notification)
        key = re.search(r'INDEXNOW_KEY: "([A-Za-z0-9-]+)"', notification).group(1)
        location = re.search(r'INDEXNOW_KEY_LOCATION: "([^"]+)"', notification).group(1)
        self.assertEqual(location, f"https://bluedog.website/{key}.txt")
        self.assertEqual((ROOT / "static" / f"{key}.txt").read_bytes(), key.encode("ascii"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
