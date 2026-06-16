#!/usr/bin/env python3
"""
Bridge server for the C++ chess engine.

- Serves the web UI (index.html, chess.js) as static files.
- Exposes POST /bestmove  {"fen": "...", "movetime": 1500}
  which feeds the position to the compiled C++ engine over the UCI
  protocol and returns {"bestmove": "e2e4"}.

The engine process is started once and kept alive; requests are
serialised with a lock (single engine instance).

Usage:
    python server.py                 # auto-detect the engine, port 8000
    python server.py --engine PATH   # explicit engine path
    python server.py --port 9000

Then open http://localhost:8000 in your browser.

Requires only the Python standard library (Python 3.8+).
"""

import argparse
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(HERE)


def find_engine():
    """Locate the built engine executable relative to the project."""
    names = ["chess.exe", "chess"]
    dirs = [
        PROJECT_ROOT,
        os.path.join(PROJECT_ROOT, "build"),
        os.path.join(PROJECT_ROOT, "build", "Release"),
        os.path.join(PROJECT_ROOT, "build", "Debug"),
        HERE,
    ]
    for d in dirs:
        for n in names:
            p = os.path.join(d, n)
            if os.path.isfile(p):
                return p
    return None


class Engine:
    """Thin wrapper that talks UCI to the C++ engine process."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        self.proc = subprocess.Popen(
            [path, "uci"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self._send("uci")
        self._wait_for("uciok")
        self._send("isready")
        self._wait_for("readyok")
        print(f"[bridge] engine ready: {path}")

    def _send(self, line):
        self.proc.stdin.write(line + "\n")
        self.proc.stdin.flush()

    def _wait_for(self, token):
        while True:
            line = self.proc.stdout.readline()
            if line == "":
                raise RuntimeError("engine closed the connection")
            if line.strip() == token:
                return

    def bestmove(self, fen, movetime):
        """Return the engine's best move (UCI string) for a FEN position."""
        movetime = max(50, min(int(movetime), 60000))
        with self.lock:
            if self.proc.poll() is not None:
                raise RuntimeError("engine process has exited")
            self._send("ucinewgame")
            self._send(f"position fen {fen}")
            self._send(f"go movetime {movetime}")
            while True:
                line = self.proc.stdout.readline()
                if line == "":
                    raise RuntimeError("engine closed the connection")
                line = line.strip()
                if line.startswith("bestmove"):
                    parts = line.split()
                    return parts[1] if len(parts) > 1 else "0000"


ENGINE = None  # set in main()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # quiet

    def _send_json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") != "/bestmove":
            self._send_json({"error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
            fen = data.get("fen")
            movetime = data.get("movetime", 1500)
            if not fen:
                self._send_json({"error": "missing fen"}, 400)
                return
            move = ENGINE.bestmove(fen, movetime)
            self._send_json({"bestmove": move})
        except Exception as e:  # noqa: BLE001
            self._send_json({"error": str(e)}, 500)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"
        local = os.path.normpath(os.path.join(HERE, path.lstrip("/")))
        if not local.startswith(HERE) or not os.path.isfile(local):
            self.send_error(404)
            return
        ctype = {
            ".html": "text/html",
            ".js": "application/javascript",
            ".css": "text/css",
        }.get(os.path.splitext(local)[1], "application/octet-stream")
        with open(local, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    global ENGINE
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", help="path to the compiled engine executable")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    engine_path = args.engine or find_engine()
    if not engine_path or not os.path.isfile(engine_path):
        print("ERROR: could not find the engine executable.")
        print("Build it first, e.g.:")
        print("    g++ -std=c++17 -O2 src/*.cpp -o chess.exe")
        print("or pass it explicitly:  python server.py --engine path\\to\\chess.exe")
        sys.exit(1)

    ENGINE = Engine(engine_path)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    url = f"http://localhost:{args.port}"
    print(f"[bridge] serving UI at {url}  (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[bridge] shutting down")
        httpd.shutdown()


if __name__ == "__main__":
    main()
