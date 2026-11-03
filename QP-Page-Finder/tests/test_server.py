#!/usr/bin/env python3
"""Integration tests for the two local servers.

Run:  python3 tests/test_server.py /path/to/fixtures
Starts each server as a subprocess on 127.0.0.1, exercises every endpoint,
checks privacy headers and proves the PDF fixtures are unchanged (sha256).
No real question papers are used.
"""
import hashlib
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = sys.argv[1] if len(sys.argv) > 1 else "/tmp/qp-fixtures"

passed = 0


def check(name, cond, extra=""):
    global passed
    if cond:
        passed += 1
        print("  PASS  " + name)
    else:
        print("  FAIL  " + name + ("  " + str(extra) if extra else ""))
        sys.exit(1)


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def hashes():
    out = {}
    for f in sorted(os.listdir(FIXTURES)):
        p = os.path.join(FIXTURES, f)
        if os.path.isfile(p):
            out[f] = hashlib.sha256(open(p, "rb").read()).hexdigest()
    return out


def get(url):
    with urllib.request.urlopen(url, timeout=5) as r:
        return r.status, dict(r.headers), r.read()


def error_body(url):
    try:
        get(url)
        return 200, b""
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def run_suite(label, cmd, port):
    print("\n--- %s ---" % label)
    env = dict(os.environ)
    proc = subprocess.Popen(cmd + ["--no-browser", "--host", "127.0.0.1", "--port", str(port),
                                   "--folder", FIXTURES], cwd=ROOT, env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    base = "http://127.0.0.1:%d" % port
    try:
        for _ in range(60):
            try:
                if get(base + "/api/health")[0] == 200:
                    break
            except Exception:
                time.sleep(0.15)
        else:
            print(proc.stdout.read() if proc.poll() is not None else "")
            raise RuntimeError("server did not start")

        code, hdr, body = get(base + "/api/health")
        check(label + ": /api/health returns ok", code == 200 and json.loads(body)["ok"] is True)

        code, hdr, body = get(base + "/api/config")
        cfg = json.loads(body)
        check(label + ": config reports the requested folder",
              os.path.normcase(os.path.abspath(cfg["defaultDir"])) == os.path.normcase(os.path.abspath(FIXTURES)))
        check(label + ": offline flag set", cfg.get("offline") is True)

        code, hdr, body = get(base + "/api/scan")
        scan = json.loads(body)
        names = [f["name"] for f in scan["files"]]
        check(label + ": scan finds all PDFs", "0625_w25_qp_41.pdf" in names and len(names) >= 5, names)
        check(label + ": scan excludes non-PDFs", all(n.lower().endswith(".pdf") for n in names))

        pdf_url = base + "/api/pdf?dir=" + urllib.parse.quote(FIXTURES) + "&file=0625_w25_qp_41.pdf"
        code, hdr, body = get(pdf_url)
        check(label + ": /api/pdf streams a real PDF", code == 200 and body.startswith(b"%PDF") and
              hdr.get("Content-Type", "").startswith("application/pdf"))
        check(label + ": PDF served inline (read-only, no attachment)",
              "inline" in hdr.get("Content-Disposition", ""))
        check(label + ": no-store cache header", "no-store" in hdr.get("Cache-Control", ""))

        code, hdr, body = get(base + "/index.html")
        check(label + ": UI served", code == 200 and b"QP Page Finder" in body)
        csp = hdr.get("Content-Security-Policy", "")
        check(label + ": CSP forbids external connections", "connect-src 'self'" in csp and
              "default-src 'self'" in csp, csp[:120])
        check(label + ": no external script source in CSP", "http" not in csp)

        code, hdr, body = get(base + "/vendor/pdf.min.js")
        check(label + ": bundled pdf.js served locally", code == 200 and len(body) > 100000)
        code, hdr, body = get(base + "/vendor/lang/eng.traineddata.gz")
        check(label + ": bundled OCR data served locally", code == 200 and body[:2] == b"\x1f\x8b")
        code, hdr, body = get(base + "/vendor/core/tesseract-core-simd-lstm.wasm.js")
        check(label + ": bundled WASM core served locally", code == 200 and b"TesseractCore" in body[:400])

        bad = base + "/api/pdf?dir=" + urllib.parse.quote(FIXTURES) + "&file=../../README.md"
        c, _ = error_body(bad)
        check(label + ": path traversal blocked", c in (403, 404), c)
        c, _ = error_body(base + "/api/pdf?dir=" + urllib.parse.quote(FIXTURES) + "&file=missing.pdf")
        check(label + ": missing PDF returns 404", c == 404, c)
        c, _ = error_body(base + "/api/scan?dir=" + urllib.parse.quote(FIXTURES + "/does-not-exist"))
        check(label + ": bad folder reported as error", c == 200)  # JSON error payload
        _, _, b = get(base + "/api/scan?dir=" + urllib.parse.quote(FIXTURES + "/does-not-exist"))
        check(label + ": bad folder has error field", "error" in json.loads(b))
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def main():
    before = hashes()
    p1, p2 = free_port(), free_port()
    py = sys.executable
    run_suite("server.py", [py, os.path.join(ROOT, "server.py")], p1)
    node = subprocess.run(["which", "node"], capture_output=True, text=True).stdout.strip()
    if node:
        run_suite("server.js", [node, os.path.join(ROOT, "server.js")], p2)
    else:
        print("\n--- server.js skipped (node not found) ---")
    after = hashes()
    check("PDF fixtures unchanged after all requests (read-only)", before == after)
    print("\n%d checks passed." % passed)


if __name__ == "__main__":
    main()
