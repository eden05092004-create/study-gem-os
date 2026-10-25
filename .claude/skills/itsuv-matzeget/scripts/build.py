#!/usr/bin/env python3
"""בונה את המצגת מתיקיית המצגת.

קבצי המקור בתיקייה (Claude כותב אותם):
  deck.json    {"title": "...", "lang": "he"}  (+ "root": שינויי פונט מכל המצגת, נכתב ממצב העריכה)
  slides.html  כל השקפים: <section class="slide ..." data-title="...">...</section>
  style.css    הצבעים, הפונטים והמיקומים של המצגת הזו
  media/       תמונות וסרטונים

הפלט:
  <שם המצגת>.html   קובץ אחד לשליחה: התמונות, הפונטים והאייקונים בפנים (וידאו נשאר קובץ ליד)
  dev (--dev)       גרסת עבודה שהשרת מגיש, עם מצב עריכה, בלי הטמעה (נטען מהר)

שימוש:  python3 build.py <תיקיית מצגת> [--dev]
סימונים בקוד: {{ICON:שם}} מוחלף באייקון Lucide.
"""
import base64, json, mimetypes, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE.parent / "assets"

# קטלוג הפונטים: שם המשפחה, שם הקובץ, משקלים, תיאור לבחירה במצב עריכה
FONTS = [
    ("Heebo", "heebo", (400, 700, 900), "Heebo (נקי ומודרני)"),
    ("Rubik", "rubik", (400, 700, 900), "Rubik (עגול וחברותי)"),
    ("Assistant", "assistant", (400, 700), "Assistant (קליל)"),
    ("Noto Sans Hebrew", "noto-sans-hebrew", (400, 700, 900), "Noto Sans Hebrew (ניטרלי)"),
    ("IBM Plex Sans Hebrew", "ibm-plex-sans-hebrew", (400, 700), "IBM Plex (טכנולוגי)"),
    ("Frank Ruhl Libre", "frank-ruhl-libre", (400, 700, 900), "פרנק רוהל (סריף קלאסי)"),
    ("Bellefair", "bellefair", (400,), "Bellefair (אלגנטי)"),
    ("Suez One", "suez-one", (400,), "Suez One (כותרת עבה)"),
    ("Secular One", "secular-one", (400,), "Secular One (כותרת חזקה)"),
    ("Varela Round", "varela-round", (400,), "Varela Round (רך)"),
    ("Karantina", "karantina", (400, 700), "Karantina (צר ודרמטי)"),
    ("Amatic SC", "amatic-sc", (400, 700), "Amatic (כתב יד)"),
]
HEB_RANGE = "U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F"

BAR = """<div id="bar" role="toolbar" aria-label="שליטה במצגת">
<button data-act="next" title="הבא" aria-label="הבא">{{ICON:chevron-right}}</button>
<span class="count">1 / 1</span>
<button data-act="prev" title="הקודם" aria-label="הקודם">{{ICON:chevron-left}}</button>
<span class="sep"></span>
<button data-act="grid" title="כל השקפים (G)">{{ICON:layout-grid}}<span>שקפים</span></button>
<button data-act="full" title="מסך מלא (F)">{{ICON:maximize}}<span>מסך מלא</span></button>
<button data-act="notes" title="הערות דובר בחלון נפרד (N)">{{ICON:notebook-pen}}<span>הערות</span></button>
<button data-act="edit" title="מצב עריכה">{{ICON:pencil}}<span>עריכה</span></button>
</div>
<div id="grid"><div class="hd">כל השקפים. לחיצה עוברת לשקף, Esc סוגר.</div><div class="wrap"></div></div>
<div id="toast" role="status"></div>"""

_icons = None


def icons():
    global _icons
    if _icons is None:
        _icons = json.loads((ASSETS / "icons" / "lucide.json").read_text("utf-8"))["icons"]
    return _icons


def icon_svg(name):
    body = icons().get(name)
    if body is None:
        raise SystemExit(f"אייקון לא קיים: {name}. חפשו שם אחר: run.sh icons <מילה>")
    return f'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">{body}</svg>'


def put_icons(text):
    return re.sub(r"\{\{ICON:([a-z0-9-]+)\}\}", lambda m: icon_svg(m.group(1)), text)


def safe_name(s):
    s = re.sub(r'[\\/:*?"<>|\n\r\t]+', " ", str(s)).strip().strip(".")
    return re.sub(r"\s+", " ", s)[:80] or "מצגת"


def font_faces(used, embed):
    out = []
    for fam, slug, weights, _ in FONTS:
        if used is not None and fam.lower() not in used:
            continue
        for w in weights:
            for sub, rng in (("latin", ""), ("hebrew", f"unicode-range:{HEB_RANGE};")):
                f = ASSETS / "fonts" / f"{slug}-{sub}-{w}.woff2"
                if not f.exists():
                    continue
                src = ("data:font/woff2;base64," + base64.b64encode(f.read_bytes()).decode()) if embed else f"/__skill/fonts/{f.name}"
                out.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:block;{rng}src:url({src}) format('woff2')}}")
    return "\n".join(out)


def used_fonts(*texts):
    blob = " ".join(texts).lower()
    found = {fam.lower() for fam, *_ in FONTS if fam.lower() in blob}
    return found or {"heebo"}


def data_uri(path: Path):
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def inline_media(html, deck_dir: Path):
    """תמונות מ-media/ נכנסות לתוך הקובץ. וידאו נשאר קישור לקובץ ליד המצגת."""
    def rep(m):
        attr, q, rel = m.group(1), m.group(2), m.group(3)
        p = (deck_dir / rel).resolve()
        if not p.exists() or p.suffix.lower() in (".mp4", ".mov", ".webm", ".m4v"):
            return m.group(0)
        return f"{attr}{q}{data_uri(p)}{q}"
    html = re.sub(r'((?:src|poster|href)=)(["\'])((?:\./)?media/[^"\']+)\2', rep, html)
    def rep_url(m):
        p = (deck_dir / m.group(3)).resolve()
        return f"url({data_uri(p)})" if p.exists() else m.group(0)
    html = re.sub(r"(url\()(['\"]?)((?:\./)?media/[^'\")]+)\2\)", rep_url, html)
    return html


def assemble(deck_dir: Path, dev=False):
    deck = json.loads((deck_dir / "deck.json").read_text("utf-8")) if (deck_dir / "deck.json").exists() else {}
    title = deck.get("title") or deck_dir.name
    lang = deck.get("lang", "he")
    slides = (deck_dir / "slides.html").read_text("utf-8")
    style = (deck_dir / "style.css").read_text("utf-8") if (deck_dir / "style.css").exists() else ""
    root_vars = deck.get("root") or {}
    root_css = (":root{" + ";".join(f"{k}:{v}" for k, v in root_vars.items()) + "}") if root_vars else ""
    used = None if dev else used_fonts(style, slides, root_css)
    css = "\n".join([
        font_faces(used, embed=not dev),
        (ASSETS / "engine.css").read_text("utf-8"),
        (ASSETS / "components.css").read_text("utf-8"),
        style, root_css,
        (ASSETS / "edit.css").read_text("utf-8") if dev else "",
    ])
    body = put_icons(slides)
    html_cls = ' class="dev"' if dev else ""
    dirn = "rtl" if lang in ("he", "ar") else "ltr"
    dev_js = dev_data = ""
    if dev:
        fonts = [{"name": f, "label": lab} for f, _, _, lab in FONTS]
        dev_data = (f"<script>window.DECK_FONTS={json.dumps(fonts, ensure_ascii=False)};window.DECK_TOTAL={int(deck.get('total') or 0)};"
                    f"window.DECK_ROOT={json.dumps(root_vars, ensure_ascii=False)};</script>")
        dev_js = f"<script>{(ASSETS / 'edit.js').read_text('utf-8')}</script>"
    out = f"""<!doctype html>
<html lang="{lang}" dir="{dirn}"{html_cls}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="deck-title" content="{title.replace('"', '&quot;')}">
<title>{title}</title>
<style>
{css}
</style>
</head>
<body>
<div id="deck"><div id="stage">
{body}
</div></div>
{put_icons(BAR)}
{dev_data}
<script>{(ASSETS / 'qrcode.js').read_text('utf-8')}</script>
<script>{(ASSETS / 'deck.js').read_text('utf-8')}</script>
{dev_js}
</body>
</html>
"""
    if not dev:
        out = inline_media(out, deck_dir)
    return out, title


def build(deck_dir: Path):
    html, title = assemble(deck_dir)
    out = deck_dir / f"{safe_name(title)}.html"
    out.write_text(html, "utf-8")
    return out


def main():
    deck_dir = Path(sys.argv[1]).resolve()
    if "--dev" in sys.argv:
        html, _ = assemble(deck_dir, dev=True)
        out = deck_dir / ".work" / "dev.html"
        out.parent.mkdir(exist_ok=True)
        out.write_text(html, "utf-8")
    else:
        out = build(deck_dir)
    size = out.stat().st_size / 1e6
    print(json.dumps({"html": str(out), "mb": round(size, 1)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
