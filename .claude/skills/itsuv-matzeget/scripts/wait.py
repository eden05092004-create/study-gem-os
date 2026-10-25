#!/usr/bin/env python3
"""מחכה למשתמש במצב עריכה: בקשה חדשה ל-Claude, או לחיצה על "סיימתי".

שימוש: python3 wait.py <תיקיית מצגת> [--timeout שניות]
מדפיס JSON ויוצא:
  {"event": "request", "requests": [...]}   בקשות חדשות מהמצגת (שקף חדש, תמונת AI, בקשה חופשית)
  {"event": "done"}                         המשתמש לחץ "סיימתי"
  {"event": "timeout"}                      לא קרה כלום בזמן הזה
"""
import json, sys, time
from pathlib import Path


def main():
    deck = Path(sys.argv[1]).resolve()
    timeout = float(sys.argv[sys.argv.index("--timeout") + 1]) if "--timeout" in sys.argv else 3000
    work = deck / ".work"
    work.mkdir(exist_ok=True)
    req, seen_f, done = work / "requests.jsonl", work / "requests.seen", work / "done"
    seen = int(seen_f.read_text() or 0) if seen_f.exists() else 0
    t0 = time.time()
    while time.time() - t0 < timeout:
        lines = req.read_text("utf-8").splitlines() if req.exists() else []
        if len(lines) > seen:
            time.sleep(1.5)  # עוד בקשות שנשלחות יחד
            lines = req.read_text("utf-8").splitlines()
            new = [json.loads(x) for x in lines[seen:] if x.strip()]
            seen_f.write_text(str(len(lines)))
            print(json.dumps({"event": "request", "requests": new}, ensure_ascii=False, indent=1))
            return
        if done.exists():
            done.unlink()
            print(json.dumps({"event": "done"}, ensure_ascii=False))
            return
        time.sleep(1)
    print(json.dumps({"event": "timeout"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
