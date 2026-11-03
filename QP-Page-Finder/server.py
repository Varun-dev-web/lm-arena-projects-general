#!/usr/bin/env python3
"""QP Page Finder - tiny, read-only, localhost-only web server.

Python 3 standard library only. No dependencies, no installs, no internet.
It serves the app UI and streams PDF files from a folder on *your* computer to
your own browser. It never writes files, never logs PDF contents, and binds to
127.0.0.1 unless you explicitly pass --host 0.0.0.0.

Run:  python server.py            (opens your browser automatically)
      python server.py --no-browser
      python server.py --port 9000 --folder "C:\\IGCSE\\Papers"
"""

import argparse
import json
import mimetypes
import os
import socket
import sys
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent
WEB_ROOT = APP_ROOT / "web"
# The app is meant to be placed *inside* (or next to) the folder with the PDFs,
# so the default scan folder is the folder that contains QP-Page-Finder.
DEFAULT_FOLDER = APP_ROOT.parent

MAX_FILES = 3000

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".pdf": "application/pdf",
    ".wasm": "application/wasm",
    ".gz": "application/gzip",
    ".ttf": "font/ttf",
    ".pfb": "application/octet-stream",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
}

CSP = (
    "default-src 'self' blob: data:; "
    "script-src 'self' 'unsafe-eval' blob:; "
    "worker-src 'self' blob:; "
    "connect-src 'self'; "
    "img-src 'self' data: blob:; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self' data:; "
    "object-src 'self'; "
    "base-uri 'self'; form-action 'self'"
)


def _json(handler, obj, status=200):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler._common_headers()
    handler.end_headers()
    handler.wfile.write(body)


def _safe_resolve(folder, rel):
    """Resolve `rel` inside `folder`, never allowing traversal outside it."""
    folder = Path(folder).resolve()
    candidate = (folder / rel).resolve()
    try:
        candidate.relative_to(folder)
    except ValueError:
        return None
    return candidate


def _scan(folder, recursive):
    folder = Path(folder)
    if not folder.is_dir():
        return {"error": "Not a folder: %s" % folder, "dir": str(folder), "files": []}
    found = []
    root = folder.resolve()
    if recursive:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d not in ("node_modules", "__pycache__")]
            for fn in filenames:
                if fn.lower().endswith(".pdf"):
                    p = Path(dirpath) / fn
                    try:
                        found.append((str(p.relative_to(root)), p.stat().st_size))
                    except OSError:
                        pass
            if len(found) >= MAX_FILES:
                break
    else:
        for p in root.iterdir():
            try:
                if p.is_file() and p.name.lower().endswith(".pdf"):
                    found.append((p.name, p.stat().st_size))
            except OSError:
                pass
    found.sort(key=lambda x: x[0].lower())
    files = [{"name": rel.rsplit("/", 1)[-1].rsplit("\\", 1)[-1], "rel": rel, "size": size}
             for rel, size in found[:MAX_FILES]]
    return {"dir": str(root), "files": files, "truncated": len(found) > MAX_FILES}


class Handler(BaseHTTPRequestHandler):
    server_version = "QPPageFinder/1.0"
    sys_version = ""

    def _common_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        # Deliberately NO Cross-Origin-Opener-Policy / X-Frame-Options / frame-ancestors
        # here: the app is served in an iframe by local preview proxies, and COOP
        # on the framed response can break that. External connections are still
        # blocked by the connect-src 'self' CSP directive above.

    def log_message(self, fmt, *args):
        # Only report errors; never write PDF names or contents to a log file.
        if args and str(args[0]).startswith("code "):
            return
        sys.stderr.write("QP Page Finder: " + (fmt % args) + "\n")

    def do_HEAD(self):
        self.do_GET(head=True)

    def do_GET(self, head=False):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        path = parsed.path

        if path == "/api/health":
            return _json(self, {"ok": True, "app": "QP Page Finder", "offline": True})

        if path == "/api/config":
            return _json(self, {
                "appDir": str(APP_ROOT),
                "parentDir": str(DEFAULT_FOLDER.resolve()),
                "defaultDir": str((self.server.scan_folder or DEFAULT_FOLDER).resolve()),
                "offline": True,
                "python": sys.version.split()[0],
                "note": "All processing happens in your browser on this machine."
            })

        if path == "/api/scan":
            folder = qs.get("dir", [str(self.server.scan_folder or DEFAULT_FOLDER)])[0]
            recursive = qs.get("recursive", ["0"])[0] == "1"
            return _json(self, _scan(folder, recursive))

        if path == "/api/pdf":
            folder = qs.get("dir", [str(self.server.scan_folder or DEFAULT_FOLDER)])[0]
            rel = qs.get("file", [None])[0]
            if not rel:
                return _json(self, {"error": "Missing file parameter"}, 400)
            p = _safe_resolve(folder, rel)
            if p is None or not p.is_file() or p.suffix.lower() != ".pdf":
                return _json(self, {"error": "PDF not found or outside the selected folder"}, 404)
            try:
                size = p.stat().st_size
                with p.open("rb") as fh:                     # READ ONLY
                    data = fh.read()
            except OSError as exc:
                return _json(self, {"error": "Cannot read PDF: %s" % exc}, 403)
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition", 'inline; filename="%s"' % p.name.replace('"', ""))
            self.send_header("Cache-Control", "no-store")
            self._common_headers()
            self.end_headers()
            if not head:
                self.wfile.write(data)
            return

        # Static files from web/
        if path in ("/", ""):
            path = "/index.html"
        rel = urllib.parse.unquote(path).lstrip("/")
        if ".." in rel.split("/"):
            self.send_error(403)
            return
        target = _safe_resolve(WEB_ROOT, rel)
        if target is None or not target.is_file():
            self.send_error(404, "Not found")
            return
        ext = target.suffix.lower()
        ctype = MIME.get(ext) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        try:
            data = target.read_bytes()
        except OSError:
            self.send_error(404, "Not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._common_headers()
        self.end_headers()
        if not head:
            self.wfile.write(data)


def pick_port(preferred, host):
    # SO_REUSEADDR is essential here: restarting the app leaves old connections
    # in TIME_WAIT, and a plain bind() would report EADDRINUSE even though no
    # other process is listening. ThreadingHTTPServer also sets this flag when
    # it does the real bind.
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind((host, preferred))
        return preferred
    except OSError:
        pass
    finally:
        probe.close()
    # Only fall back to an ephemeral port if something else truly owns the port.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind((host, 0))
        return s.getsockname()[1]


def main():
    ap = argparse.ArgumentParser(description="QP Page Finder local server")
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--host", default="127.0.0.1", help="Default 127.0.0.1 (local only)")
    ap.add_argument("--folder", default=None, help="Initial PDF folder")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    port = pick_port(args.port, args.host)
    httpd = ThreadingHTTPServer((args.host, port), Handler)
    httpd.scan_folder = Path(args.folder) if args.folder else None
    url = "http://%s:%d/" % ("127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host, port)
    print("=" * 62)
    print("  QP Page Finder - local, offline PDF page finder")
    print("=" * 62)
    print("  Open this address in your browser:")
    print("    " + url)
    print("  PDF folder: %s" % (args.folder or DEFAULT_FOLDER.resolve()))
    print("  Nothing is uploaded. Close this window (or press Ctrl+C) to stop.")
    print("=" * 62, flush=True)
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
