#!/usr/bin/env python3
"""תמונות אמיתיות מוויקישיתוף (Wikimedia Commons): חיפוש, דף מועמדים, הורדה וקרדיט.

ויקישיתוף מכיל רק תמונות ברישיון חופשי (נחלת הכלל, CC0, CC BY, CC BY-SA),
כולל אוסף גדול של תמונות היסטוריות מלשכת העיתונות הממשלתית.

שימוש:
  python3 photos.py search "<חיפוש באנגלית>" <תיקיית מצגת> [--n 8]
      מחפש, שומר דף מועמדים ממוספר (.work/photos-<מילה>.jpg) ומדפיס JSON עם הפרטים.
  python3 photos.py get <מספר> "<חיפוש>" <תיקיית מצגת> <נתיב יעד, למשל media/s02.jpg>
      מוריד את המועמד שנבחר, מקטין למצגת, ומדפיס את שורת הקרדיט.
מה נשלח החוצה: רק מילות החיפוש לוויקישיתוף, והורדת התמונות שנבחרו.
"""
import hashlib, html, io, json, re, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "itsuv-matzeget/1.0 (presentation skill; contact via practice-ai.co.il)"}


def get_json(params):
    url = API + "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
        return json.load(r)


def fetch(url, limit=25_000_000):
    """הורדה עם המתנה וניסיון חוזר: ויקישיתוף מגביל הורדות מהירות מדי (שגיאה 429)."""
    import time
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read(limit)
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            time.sleep(4 * (attempt + 1))


def clean(s):
    s = re.sub(r"<[^>]+>", "", html.unescape(s or ""))
    return re.sub(r"\s+", " ", s).strip()


def search(query, n=8):
    data = get_json({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": 30,
        "gsrsearch": f"{query} filetype:bitmap", "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1920,
    })
    pages = sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg", "image/png") or ii.get("width", 0) < 900:
            continue
        md = ii.get("extmetadata") or {}
        lic = clean((md.get("LicenseShortName") or {}).get("value"))
        if re.search(r"\bNC\b|\bND\b|fair use", lic, re.I):
            continue
        out.append({
            "n": len(out) + 1,
            "title": p.get("title", "").replace("File:", ""),
            "thumb": ii.get("thumburl") or ii.get("url"),
            "url": ii.get("url"),
            "size": f'{ii.get("width")}x{ii.get("height")}',
            "license": lic or "?",
            "artist": clean((md.get("Artist") or {}).get("value"))[:80],
            "date": clean((md.get("DateTimeOriginal") or {}).get("value"))[:30],
            "desc": clean((md.get("ImageDescription") or {}).get("value"))[:160],
            "page": ii.get("descriptionurl"),
        })
        if len(out) >= n:
            break
    return out


def std_url(it, want):
    """כתובת לתמונה מוקטנת בגודל סטנדרטי של ויקישיתוף (ויקישיתוף חוסם הורדת מקורות בקצב גבוה)."""
    w = int(str(it.get("size", "0x0")).split("x")[0] or 0)
    std = next((x for x in (want, 1920, 1280, 960, 500, 330) if x <= want and x < w), None)
    base = (it.get("url") or "").split("?")[0]
    thumb = (it.get("thumb") or "").split("?")[0]
    if std and "/thumb/" in thumb:
        return re.sub(r"/\d+px-", f"/{std}px-", thumb)
    if std and "/wikipedia/commons/" in base:
        name = base.rsplit("/", 1)[1]
        return base.replace("/wikipedia/commons/", "/wikipedia/commons/thumb/", 1) + f"/{std}px-{name}"
    return base


def slug(q):
    return re.sub(r"[^a-z0-9]+", "-", q.lower()).strip("-")[:40] or hashlib.md5(q.encode()).hexdigest()[:8]


def contact_sheet(items, out):
    w, h, cols = 380, 260, 4
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + 12) + 12, rows * (h + 12) + 12), (24, 24, 30))
    d = ImageDraw.Draw(sheet)
    for i, it in enumerate(items):
        try:
            im = Image.open(io.BytesIO(fetch(std_url(it, 500)))).convert("RGB")
        except Exception:  # noqa: BLE001
            continue
        im = ImageOps.fit(im, (w, h))
        x, y = 12 + (i % cols) * (w + 12), 12 + (i // cols) * (h + 12)
        sheet.paste(im, (x, y))
        d.rectangle((x, y, x + 46, y + 40), fill=(0, 0, 0))
        d.text((x + 14, y + 12), str(it["n"]), fill=(255, 255, 255))
    sheet.save(out, quality=85)


def cache_path(deck, query):
    (deck / ".work").mkdir(parents=True, exist_ok=True)
    return deck / ".work" / f"photos-{slug(query)}.json"


def score(it, shape):
    """ציון למועמד: רישיון חופשי לגמרי, רזולוציה, וצורה שמתאימה לשימוש בשקף."""
    w, h = (int(x) for x in it["size"].split("x"))
    s = min(w, 3000) / 3000
    lic = it["license"].lower()
    if "public domain" in lic or "cc0" in lic or "no restrictions" in lic:
        s += 0.6
    r = w / max(h, 1)
    if shape == "wide":
        s += 0.8 if r >= 1.3 else (-0.4 if r < 1 else 0)
    elif shape == "tall":
        s += 0.8 if r <= 0.9 else 0
    if re.search(r"\b(map|logo|diagram|chart|stamp|coin|seal|flag of|coat of arms|svg)\b", it["title"], re.I):
        s -= 0.7
    return s


def relevant(it, query):
    """המועמד קשור לחיפוש: לפחות מילה אחת מהחיפוש מופיעה בשם הקובץ או בתיאור."""
    words = [w for w in re.findall(r"[a-z]{3,}", query.lower()) if w not in ("the", "and", "with", "photo", "photograph", "image")]
    hay = it.get("title", "").lower()
    return sum(1 for w in words if w in hay or w.rstrip("s") in hay)


def batch(spec_path, deck):
    """חיפוש והורדה במקביל לכל התמונות של המצגת.
    קובץ הקלט: JSON, רשימה של {"name": "s03", "query": "...", "shape": "wide|tall|any", "pick": מספר (לא חובה)}.
    לכל שורה: מחפש, בוחר את המועמד הטוב ביותר (או את pick), מוריד ל-media/<name>.jpg.
    בסוף: דף אחד עם כל התמונות שנבחרו (.work/photos.jpg) ו-JSON עם קרדיטים ומועמדים חלופיים."""
    import time
    from concurrent.futures import ThreadPoolExecutor
    spec = json.loads(Path(spec_path).read_text("utf-8"))
    (deck / ".work").mkdir(parents=True, exist_ok=True)
    (deck / "media").mkdir(exist_ok=True)

    def one(row):
        def find(q):
            for attempt in range(3):
                try:
                    return [x for x in search(q, 10) if relevant(x, q)]
                except Exception:  # noqa: BLE001
                    time.sleep(2 * (attempt + 1))
            return []
        items = find(row["query"])
        if not items:  # חיפוש ארוך מדי: מנסים שוב עם 2 המילים הראשונות
            short = " ".join(row["query"].split()[:2])
            if short != row["query"]:
                items = find(short)
        cache_path(deck, row["query"]).write_text(json.dumps(items, ensure_ascii=False), "utf-8")
        if not items:
            return {"name": row["name"], "query": row["query"], "error": "לא נמצאו תמונות. נסו חיפוש אחר"}
        ranked = sorted(items, key=lambda it: -(score(it, row.get("shape", "any")) + 0.5 * relevant(it, row["query"])))
        chosen = next((x for x in items if x["n"] == row.get("pick")), ranked[0])
        return {"name": row["name"], "query": row["query"], "chosen": chosen,
                "others": [{k: x[k] for k in ("n", "title", "size", "license")} for x in ranked if x is not chosen][:4]}

    with ThreadPoolExecutor(max_workers=6) as ex:
        found = list(ex.map(one, spec))

    def dl(r):
        if "chosen" not in r:
            return r
        it = r["chosen"]
        try:
            im = Image.open(io.BytesIO(fetch(std_url(it, 1920)))).convert("RGB")
            im.thumbnail((2400, 2400))
            im.save(deck / "media" / f"{r['name']}.jpg", quality=86)
            r["file"] = f"media/{r['name']}.jpg"
            r["size"] = f"{im.size[0]}x{im.size[1]}"
        except Exception as e:  # noqa: BLE001
            r["error"] = f"ההורדה נכשלה: {e}"
        return r

    with ThreadPoolExecutor(max_workers=3) as ex:
        found = list(ex.map(dl, found))

    prev_f = deck / ".work" / "photos.json"
    prev = {p["name"]: p for p in json.loads(prev_f.read_text("utf-8"))} if prev_f.exists() else {}
    names = {r["name"] for r in found}
    tiles = [(n, deck / p["file"]) for n, p in prev.items() if n not in names and p.get("file") and (deck / p["file"]).exists()]
    tiles += [(r["name"], deck / r["file"]) for r in found if r.get("file")]
    tiles.sort()
    if tiles:
        w, h, cols = 420, 280, 4
        rows = (len(tiles) + cols - 1) // cols
        S = Image.new("RGB", (cols * (w + 10) + 10, rows * (h + 10) + 10), (24, 24, 30))
        d = ImageDraw.Draw(S)
        for i, (name, p) in enumerate(tiles):
            im = ImageOps.contain(Image.open(p).convert("RGB"), (w, h))
            x, y = 10 + (i % cols) * (w + 10), 10 + (i // cols) * (h + 10)
            S.paste(im, (x + (w - im.size[0]) // 2, y + (h - im.size[1]) // 2))
            d.rectangle((x, y, x + 60, y + 24), fill=(0, 0, 0))
            d.text((x + 6, y + 6), name, fill=(255, 255, 255))
        S.save(deck / ".work" / "photos.jpg", quality=85)
    out = []
    for r in found:
        o = {"name": r["name"], "query": r["query"]}
        if r.get("file"):
            it = r["chosen"]
            o.update(file=r["file"], size=r["size"], title=it["title"][:90],
                     credit=f'{it["artist"] or "לא ידוע"}, {it["license"]}, ויקישיתוף', others=r["others"])
        else:
            o["error"] = r.get("error")
        out.append(o)
    merged = dict(prev); merged.update({o["name"]: o for o in out})
    (deck / ".work" / "photos.json").write_text(json.dumps(sorted(merged.values(), key=lambda o: o["name"]), ensure_ascii=False, indent=1), "utf-8")
    print(json.dumps({"sheet": str(deck / ".work" / "photos.jpg"), "photos": out}, ensure_ascii=False, indent=1))


def main():
    cmd = sys.argv[1]
    if cmd == "search":
        query, deck = sys.argv[2], Path(sys.argv[3]).resolve()
        n = int(sys.argv[sys.argv.index("--n") + 1]) if "--n" in sys.argv else 8
        (deck / ".work").mkdir(parents=True, exist_ok=True)
        try:
            items = search(query, n)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"error": f"החיפוש נכשל: {e}"}, ensure_ascii=False))
            return
        cache_path(deck, query).write_text(json.dumps(items, ensure_ascii=False), "utf-8")
        sheet = deck / ".work" / f"photos-{slug(query)}.jpg"
        if items:
            contact_sheet(items, sheet)
        print(json.dumps({"query": query, "sheet": str(sheet) if items else None,
                          "results": [{k: it[k] for k in ("n", "title", "size", "license", "date", "desc")} for it in items]},
                         ensure_ascii=False, indent=1))
    elif cmd == "batch":
        batch(sys.argv[2], Path(sys.argv[3]).resolve())
    elif cmd == "get":
        num, query, deck, dest = int(sys.argv[2]), sys.argv[3], Path(sys.argv[4]).resolve(), sys.argv[5]
        items = json.loads(cache_path(deck, query).read_text("utf-8"))
        it = next(x for x in items if x["n"] == num)
        # ויקישיתוף מבקש להוריד תמונות מוקטנות בגדלים הסטנדרטיים (1920), לא את הקובץ המקורי
        src = std_url(it, 1920)
        im = Image.open(io.BytesIO(fetch(src))).convert("RGB")
        im.thumbnail((2400, 2400))
        out = deck / dest
        out.parent.mkdir(parents=True, exist_ok=True)
        im.save(out, quality=88)
        who = it["artist"] or "לא ידוע"
        credit = f"{who}, {it['license']}, ויקישיתוף"
        print(json.dumps({"saved": dest, "credit": credit, "page": it["page"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
