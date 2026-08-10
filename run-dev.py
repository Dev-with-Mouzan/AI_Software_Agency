#!/usr/bin/env python3
"""Run the full stack (FastAPI backend + Next.js frontend) from a single file.

Usage:
    python run-dev.py

Starts the agency API on http://localhost:8000 and the web dashboard on
http://localhost:3000. Press Ctrl+C to stop both.
"""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
AGENCY_DIR = os.path.join(ROOT, "agency")
FRONTEND_DIR = os.path.join(ROOT, "frontend")

API_PORT = os.environ.get("API_PORT", "8000")
WEB_PORT = os.environ.get("WEB_PORT", "3000")

SERVERS = [
    ("api", ["uv", "run", "uvicorn", "agency.api.main:app", "--reload", "--port", API_PORT], AGENCY_DIR),
    ("web", ["npm", "run", "dev"], FRONTEND_DIR),
]


def spawn(name: str, argv: list[str], cwd: str) -> subprocess.Popen:
    exe = shutil.which(argv[0])
    if exe is None:
        print(
            f"[{name}] error: `{argv[0]}` not found on PATH — install it or re-run with it on PATH",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(1)
    kwargs: dict = {
        "cwd": cwd,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.STDOUT,
        "bufsize": 1,
        "text": True,
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    print(f"[{name}] starting: {' '.join(argv)} (in {cwd})", flush=True)
    return subprocess.Popen([exe, *argv[1:]], **kwargs)


def kill_tree(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            capture_output=True,
        )
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass


def stream(name: str, proc: subprocess.Popen) -> None:
    for line in proc.stdout:
        sys.stdout.write(f"[{name}] {line}")
        sys.stdout.flush()


def main() -> int:
    if not os.path.isdir(AGENCY_DIR) or not os.path.isdir(FRONTEND_DIR):
        print("error: expected agency/ and frontend/ next to this script", file=sys.stderr)
        return 1

    print("=" * 64)
    print("  AI Software Agency - full stack dev")
    print(f"  API : http://localhost:{API_PORT}   (docs at /api/docs)")
    print(f"  Web : http://localhost:{WEB_PORT}")
    print("  Stop: Ctrl+C")
    print("=" * 64)

    procs = {name: spawn(name, argv, cwd) for name, argv, cwd in SERVERS}
    threads = [
        threading.Thread(target=stream, args=(name, proc), daemon=True)
        for name, proc in procs.items()
    ]
    for t in threads:
        t.start()

    try:
        while True:
            exited = [name for name, proc in procs.items() if proc.poll() is not None]
            if exited:
                print(f"[{exited[0]}] exited with code {procs[exited[0]].returncode}", flush=True)
                return procs[exited[0]].returncode or 1
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n[run-dev] stopping both servers...", flush=True)
    finally:
        for name, proc in procs.items():
            if proc.poll() is None:
                kill_tree(proc)

    return 0


if __name__ == "__main__":
    sys.exit(main())
