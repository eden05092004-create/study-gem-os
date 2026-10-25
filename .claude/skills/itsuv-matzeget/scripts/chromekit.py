"""עזרים משותפים להרצת Chrome ברקע (צילום שקפים, הדפסה ל-PDF, שליפת מידע מהמצגת)."""
import json, re, shutil, subprocess, sys
from pathlib import Path

W, H = 1920, 1080

CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


def find_chrome():
    for c in CANDIDATES:
        if Path(c).exists():
            return c
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    return None


def run(chrome_bin, profile, *args, budget=4000, timeout=120):
    cmd = [chrome_bin, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
           "--no-default-browser-check", "--mute-audio", "--disable-crashpad", "--disable-breakpad",
           "--noerrdialogs", "--allow-file-access-from-files", f"--user-data-dir={profile}",
           f"--window-size={W},{H}", f"--virtual-time-budget={budget}", *args]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def dom_json(chrome_bin, profile, url, tag_id, budget=4000):
    r = run(chrome_bin, profile, "--dump-dom", url, budget=budget)
    m = re.search(r'<script type="application/json" id="%s">(.*?)</script>' % re.escape(tag_id), r.stdout, re.S)
    if not m:
        raise RuntimeError(f"המצגת לא החזירה את {tag_id} (קוד {r.returncode}).\n{r.stderr[-1200:]}")
    return json.loads(m.group(1))
