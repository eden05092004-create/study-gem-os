#!/usr/bin/env python3
"""שרת מקומי למצגת: מגיש את גרסת העבודה עם מצב עריכה, שומר עריכות, ומעביר בקשות ל-Claude.

  GET  /              המצגת (נבנית מחדש בכל טעינה, עם מצב עריכה)
  GET  /media/...     קבצי המצגת
  GET  /__skill/...   קבצי הסקיל (פונטים)
  GET  /api/version   חותמת שמשתנה כשקבצי המקור משתנים (לרענון חי)
  POST /api/save      {html, root} שומר את slides.html (עם גיבוי) ובונה מחדש את קובץ ה-HTML לשליחה
  POST /api/upload    {name, data(base64)} שומר תמונה ב-media/ ומחזיר src
  POST /api/request   בקשה ל-Claude (שקף חדש, תמונת AI, בקשה חופשית) נכתבת ל-.work/requests.jsonl
  POST /api/done      המשתמש לחץ "סיימתי"

שימוש: python3 server.py <תיקיית מצגת> [--port 8765] [--daemon]
אחרי ההפעלה נכתב <תיקייה>/.work/server.json עם הכתובת.
"""
import base64, json, os, re, socket, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"
sys.path.insert(0, str(HERE))
import build  # noqa: E402

LAST = [time.time()]
IDLE_LIMIT = 4 * 3600  # השרת נסגר לבד אחרי 4 שעות בלי שימוש
LOCK = threading.Lock()


def free_port(preferred):
    for p in [preferred] + list(range(preferred + 1, preferred + 60)):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    raise SystemExit("לא נמצא פורט פנוי")


def version(deck_dir: Path):
    files = [deck_dir / "slides.html", deck_dir / "style.css", deck_dir / "deck.json"]
    media = deck_dir / "media"
    if media.exists():
        files += list(media.iterdir())
    return str(round(max((f.stat().st_mtime for f in files if f.exists()), default=0), 3))


def make_handler(deck_dir: Path):
    work = deck_dir / ".work"
    work.mkdir(exist_ok=True)

    class H(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(deck_dir), **k)

        def log_message(self, *a):
            pass

        def end_headers(self):
            LAST[0] = time.time()
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def _send(self, code, body: bytes, ctype):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code, obj):
            self._send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            path = self.path.split("?")[0].split("#")[0]
            if path in ("/", "/index.html"):
                try:
                    html, _ = build.assemble(deck_dir, dev=True)
                except Exception as e:  # noqa: BLE001
                    html = f"<meta charset=utf-8><pre style='font:16px system-ui;padding:30px;direction:rtl'>המצגת לא נבנתה: {e}</pre>"
                return self._send(200, html.encode(), "text/html; charset=utf-8")
            if path.startswith("/__skill/"):
                f = (ASSETS / path[len("/__skill/"):]).resolve()
                if ASSETS in f.parents and f.exists():
                    ctype = "font/woff2" if f.suffix == ".woff2" else "application/octet-stream"
                    return self._send(200, f.read_bytes(), ctype)
                return self._json(404, {"error": "not found"})
            if path == "/api/version":
                return self._json(200, {"v": version(deck_dir)})
            if path.startswith("/.work") or path.endswith((".jsonl", ".py")):
                return self._json(403, {"error": "forbidden"})
            return super().do_GET()

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            if n > 40_000_000:
                return self._json(413, {"error": "הקובץ גדול מדי"})
            try:
                data = json.loads(self.rfile.read(n) or b"{}")
            except ValueError:
                return self._json(400, {"error": "bad json"})
            path = self.path.split("?")[0]
            if path == "/api/save":
                html = data.get("html") or ""
                if "<section" not in html:
                    return self._json(400, {"error": "אין שקפים בשמירה"})
                with LOCK:
                    hist = work / "history"
                    hist.mkdir(exist_ok=True)
                    src = deck_dir / "slides.html"
                    if src.exists():
                        (hist / time.strftime("slides-%H%M%S.html")).write_text(src.read_text("utf-8"), "utf-8")
                        for old in sorted(hist.glob("slides-*.html"))[:-40]:
                            old.unlink()
                    tmp = deck_dir / "slides.html.tmp"
                    tmp.write_text(html.strip() + "\n", "utf-8")
                    os.replace(tmp, src)
                    if isinstance(data.get("root"), dict):
                        dj = deck_dir / "deck.json"
                        deck = json.loads(dj.read_text("utf-8")) if dj.exists() else {}
                        deck["root"] = {k: v for k, v in data["root"].items() if re.fullmatch(r"--[a-z0-9-]+", k)}
                        dj.write_text(json.dumps(deck, ensure_ascii=False, indent=2), "utf-8")
                    (work / "edited").write_text(time.strftime("%Y-%m-%d %H:%M:%S"))
                    try:
                        build.build(deck_dir)
                    except Exception as e:  # noqa: BLE001
                        return self._json(500, {"error": f"נשמר, אבל הבנייה נכשלה: {e}"})
                return self._json(200, {"ok": True, "v": version(deck_dir)})
            if path == "/api/upload":
                name = re.sub(r"[^\w.\-]+", "-", data.get("name") or "image.jpg")[-60:]
                raw = base64.b64decode(data.get("data") or "")
                (deck_dir / "media").mkdir(exist_ok=True)
                dest = deck_dir / "media" / f"up-{time.strftime('%H%M%S')}-{name}"
                dest.write_bytes(raw)
                return self._json(200, {"src": "media/" + dest.name})
            if path == "/api/request":
                item = {k: data.get(k) for k in ("type", "slide", "after", "eid", "text")}
                item["time"] = time.strftime("%H:%M:%S")
                with open(work / "requests.jsonl", "a", encoding="utf-8") as f:
                    f.write(json.dumps(item, ensure_ascii=False) + "\n")
                return self._json(200, {"ok": True})
            if path == "/api/done":
                (work / "done").write_text(time.strftime("%Y-%m-%d %H:%M:%S"))
                return self._json(200, {"ok": True})
            return self._json(404, {"error": "not found"})

    return H


def daemonize(log_path: Path):
    """מנתק את השרת מהפקודה שהפעילה אותו, כדי שימשיך לרוץ ברקע."""
    if os.fork() > 0:
        os._exit(0)
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    log = open(log_path, "a", buffering=1)
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
    devnull = open(os.devnull)
    os.dup2(devnull.fileno(), 0)


def main():
    deck_dir = Path(sys.argv[1]).resolve()
    (deck_dir / ".work").mkdir(exist_ok=True)
    if "--daemon" in sys.argv:
        daemonize(deck_dir / ".work" / "server.log")
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8765
    port = free_port(port)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), make_handler(deck_dir))
    url = f"http://127.0.0.1:{port}/"
    (deck_dir / ".work" / "server.json").write_text(json.dumps({"url": url, "pid": os.getpid()}))
    print(url, flush=True)

    def idle_guard():
        while True:
            time.sleep(60)
            if time.time() - LAST[0] > IDLE_LIMIT:
                os._exit(0)
    threading.Thread(target=idle_guard, daemon=True).start()
    httpd.serve_forever()


if __name__ == "__main__":
    main()
