#!/usr/bin/env python3
"""שליפת מותג: לוגו, צבעים ופונט מאתר אינטרנט או מקובץ לוגו.

שימוש:
  python3 brand.py url  <כתובת> <תיקיית מצגת>
  python3 brand.py logo <קובץ לוגו> <תיקיית מצגת>
הפלט: JSON עם לוגו שנשמר ב-media/, צבעים מוצעים ופונטים שנמצאו.
מה נשלח החוצה: רק בקשת GET לכתובת שהמשתמש נתן, ולקבצים שהדף עצמו מפנה אליהם (CSS ולוגו).
"""
import colorsys, json, re, shutil, sys, urllib.parse, urllib.request
from collections import Counter
from pathlib import Path

from PIL import Image

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36"}


def get(url, limit=3_000_000):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=12) as r:
        return r.read(limit), r.headers.get_content_type()


def norm_hex(h):
    h = h.lower().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return "#" + h[:6] if re.fullmatch(r"[0-9a-f]{6}([0-9a-f]{2})?", h) else None


def interesting(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return s > 0.25 and 0.18 < l < 0.82


def logo_colors(path, n=3):
    im = Image.open(path).convert("RGBA")
    im.thumbnail((200, 200))
    px = [(r, g, b) for r, g, b, a in im.getdata() if a > 200]
    if not px:
        return []
    q = Image.new("RGB", (len(px), 1))
    q.putdata(px)
    pal = q.quantize(colors=8).convert("RGB")
    counts = Counter(pal.getdata())
    out = []
    for (r, g, b), _ in counts.most_common():
        hx = f"#{r:02x}{g:02x}{b:02x}"
        if interesting(hx):
            out.append(hx)
    return out[:n]


def from_url(url, deck):
    if not re.match(r"https?://", url):
        url = "https://" + url
    html_b, _ = get(url)
    html = html_b.decode("utf-8", "ignore")
    res = {"source": url, "logo": None, "colors": [], "fonts": [], "theme_color": None}

    m = re.search(r'<meta[^>]+name=["\']theme-color["\'][^>]+content=["\']([^"\']+)', html, re.I)
    if m:
        res["theme_color"] = norm_hex(m.group(1))

    css = html
    for href in re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)', html, re.I)[:3]:
        try:
            css += get(urllib.parse.urljoin(url, href), 1_500_000)[0].decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            pass
    hexes = [norm_hex(h) for h in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", css)]
    counts = Counter(h for h in hexes if h and interesting(h))
    res["colors"] = [h for h, _ in counts.most_common(5)]
    fams = re.findall(r"font-family\s*:\s*['\"]?([^;'\",}]+)", css)
    res["fonts"] = [f for f, _ in Counter(f.strip() for f in fams if f.strip().lower() not in
                                          ("inherit", "sans-serif", "serif", "monospace", "system-ui")).most_common(4)]

    cands = []
    for tag in re.findall(r"<img[^>]+>", html, re.I):
        if re.search(r"logo", tag, re.I):
            s = re.search(r'src=["\']([^"\']+)', tag)
            if s:
                cands.append(s.group(1))
    cands += re.findall(r'<link[^>]+rel=["\'](?:apple-touch-icon|icon)["\'][^>]+href=["\']([^"\']+)', html, re.I)
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html, re.I)
    if m:
        cands.append(m.group(1))
    media = deck / "media"
    media.mkdir(exist_ok=True)
    for c in cands:
        try:
            data, ctype = get(urllib.parse.urljoin(url, c))
            ext = {"image/svg+xml": ".svg", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}.get(ctype)
            if not ext:
                continue
            out = media / f"logo{ext}"
            out.write_bytes(data)
            res["logo"] = f"media/logo{ext}"
            if ext != ".svg" and not res["colors"]:
                res["colors"] = logo_colors(out)
            break
        except Exception:  # noqa: BLE001
            continue
    if res["theme_color"] and res["theme_color"] not in res["colors"]:
        res["colors"].insert(0, res["theme_color"])
    return res


def from_logo(path, deck):
    src = Path(path).expanduser().resolve()
    media = deck / "media"
    media.mkdir(exist_ok=True)
    out = media / ("logo" + src.suffix.lower())
    if src != out:
        shutil.copy2(src, out)
    cols = logo_colors(out) if out.suffix != ".svg" else []
    return {"source": str(src), "logo": f"media/{out.name}", "colors": cols, "fonts": []}


def main():
    kind, val, deck = sys.argv[1], sys.argv[2], Path(sys.argv[3]).resolve()
    try:
        res = from_url(val, deck) if kind == "url" else from_logo(val, deck)
    except Exception as e:  # noqa: BLE001
        res = {"error": f"לא הצלחתי לקרוא את המותג: {e}"}
    (deck / ".board").mkdir(parents=True, exist_ok=True)
    (deck / ".board" / "brand.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), "utf-8")
    print(json.dumps(res, ensure_ascii=False))


if __name__ == "__main__":
    main()
