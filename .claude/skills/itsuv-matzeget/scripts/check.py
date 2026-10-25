#!/usr/bin/env python3
"""בדיקת מצגת: נאמנות לתוכן, סימני AI, טקסט שיוצא או נחתך, ותמונות מבט-על לבדיקה בעיניים.

שימוש:
  python3 check.py <תיקיית מצגת>                 בדיקה מלאה + preview.png (כל שקף במצב הסופי)
  python3 check.py <תיקיית מצגת> --steps 3,5     גם צילום של כל לחיצה בשקפים 3 ו-5 (steps-3.png...)
  python3 check.py <תיקיית מצגת> --fast          בלי צילומים (רק נאמנות וסימני AI)

נאמנות: כל מילה ב-content.md חייבת להופיע בשקפים, ושום מילה לא נוספה.
  לא נבדקים: הערות דובר (.notes), קרדיטים (.credit), אייקונים, ואלמנט עם data-deco
  (קישוט שחוזר על מילה שכבר קיימת בתוכן, למשל שנה ענקית ברקע).
"""
import html as H, json, re, sys, tempfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build, chromekit  # noqa: E402

WORD = re.compile(r"[\w֐-׿][\w֐-׿'׳\"״.,%+$₪/-]*")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def norm(w):
    w = w.replace("׳", "'").replace("״", '"').replace("’", "'")
    w = w.strip(".,:;!?()[]{}\"'״׳-–—*")
    return w


def words(text):
    return Counter(n for n in (norm(w) for w in WORD.findall(text)) if n)


def content_text(md):
    out = []
    for line in md.splitlines():
        s = line.strip()
        if not s or re.fullmatch(r"[-*_=]{3,}", s):
            continue
        s = re.sub(r"\[([^\]]*)\]\([^)]*\)", "", s)          # לינקים
        s = s.replace("**", "").replace("__", "")
        s = re.sub(r"^#+\s*", "", s)
        s = re.sub(r"^[-*•]\s+", "", s)                        # תבליטים
        s = re.sub(r"^(\d+)[.)]\s+", r"\1 ", s)              # מספור רשימה נשאר כמספר (מציגים אותו בשקף כטקסט)
        m = re.match(r"^שקף\s+\d+\s*(?:[—–:-]\s*(.*))?$", s)
        if m:
            s = m.group(1) or ""
        out.append(s)
    return "\n".join(out)


def strip_tag_blocks(src, cls):
    """מסיר אלמנטים (כולל ילדים) שיש להם class מסוים או מאפיין, עם ספירת קינון."""
    out, i = [], 0
    pat = re.compile(r"<(\w+)\b[^>]*%s[^>]*>" % cls)
    while True:
        m = pat.search(src, i)
        if not m:
            out.append(src[i:])
            return "".join(out)
        out.append(src[i:m.start()])
        tag, depth, j = m.group(1), 1, m.end()
        tok = re.compile(r"<(/?)%s\b[^>]*?(/?)>" % tag)
        while depth and j < len(src):
            t = tok.search(src, j)
            if not t:
                j = len(src)
                break
            if t.group(1):
                depth -= 1
            elif not t.group(2):
                depth += 1
            j = t.end()
        i = j


def deck_text(slides_html, keep_deco=False):
    s = re.sub(r"<svg\b.*?</svg>", " ", slides_html, flags=re.S)
    s = re.sub(r"\{\{ICON:[^}]+\}\}", " ", s)
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    s = strip_tag_blocks(s, r'class="[^"]*\bnotes\b[^"]*"')
    s = strip_tag_blocks(s, r'class="[^"]*\bcredit\b[^"]*"')
    if not keep_deco:
        s = strip_tag_blocks(s, r"\bdata-deco\b")
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    return H.unescape(s)


def deco_text(slides_html):
    found = re.findall(r"<(\w+)\b[^>]*\bdata-deco\b[^>]*>(.*?)</\1>", slides_html, flags=re.S)
    return " ".join(H.unescape(re.sub(r"<[^>]+>", " ", body)) for _, body in found)


def fidelity(deck_dir):
    md = deck_dir / "content.md"
    if not md.exists():
        return {"skipped": "אין content.md"}
    slides = (deck_dir / "slides.html").read_text("utf-8")
    want = words(content_text(md.read_text("utf-8")))
    got = words(deck_text(slides))
    deco = words(deco_text(slides))
    return {"missing": dict(want - got), "added": dict(got - want),
            "deco_not_in_content": dict(deco - want)}


def ai_tells(deck_dir):
    slides = (deck_dir / "slides.html").read_text("utf-8")
    style = (deck_dir / "style.css").read_text("utf-8") if (deck_dir / "style.css").exists() else ""
    deck = json.loads((deck_dir / "deck.json").read_text("utf-8")) if (deck_dir / "deck.json").exists() else {}
    text = deck_text(slides, keep_deco=True)
    out = []
    if "—" in text or "–" in text:
        out.append("מקף ארוך בטקסט (החליפו בפסיק, נקודתיים או שורה חדשה)")
    if "·" in text:
        out.append("נקודה אמצעית (·) בטקסט")
    if re.search(r"[→←↗↘➜➔]\s*(<|$)", slides):
        out.append("חץ בסוף כפתור או שורה")
    if EMOJI.search(text):
        out.append("אימוג'י בטקסט השקפים")
    if not deck.get("allow_highlight") and re.search(r"background-clip\s*:\s*text|\bclass=\"[^\"]*\bgrad\b", style + slides):
        out.append("מילה בגרדיאנט (מותר רק אם המשתמש ביקש)")
    return out


def shoot(chrome, tmp, base, si, k, dest):
    chromekit.run(chrome, tmp / f"p{si}_{k}", f"--screenshot={dest}", f"{base}?export#{si + 1}.{k}", budget=5000)
    return dest


def sheet(paths, out, cols=3, w=640):
    from PIL import Image, ImageDraw
    h = w * 9 // 16
    rows = (len(paths) + cols - 1) // cols
    S = Image.new("RGB", (cols * (w + 8) + 8, rows * (h + 8) + 8), (230, 230, 230))
    d = ImageDraw.Draw(S)
    for i, (label, p) in enumerate(paths):
        if not Path(p).exists():
            continue
        im = Image.open(p).convert("RGB").resize((w, h))
        x, y = 8 + (i % cols) * (w + 8), 8 + (i // cols) * (h + 8)
        S.paste(im, (x, y))
        d.rectangle((x, y, x + 64, y + 26), fill=(0, 0, 0))
        d.text((x + 6, y + 7), label, fill=(255, 255, 255))
    S.save(out)


def main():
    deck_dir = Path(sys.argv[1]).resolve()
    fast = "--fast" in sys.argv
    steps_for = []
    if "--steps" in sys.argv:
        steps_for = [int(x) for x in sys.argv[sys.argv.index("--steps") + 1].split(",") if x.strip()]
    res = {"fidelity": fidelity(deck_dir), "ai_tells": ai_tells(deck_dir)}
    out_html = build.build(deck_dir)
    res["html"] = str(out_html)
    res["mb"] = round(out_html.stat().st_size / 1e6, 1)
    if not fast:
        chrome = chromekit.find_chrome()
        if not chrome:
            res["check"] = "לא נמצא Chrome, אין בדיקה בעיניים"
        else:
            work = deck_dir / ".work"
            shots = work / "shots"
            shots.mkdir(parents=True, exist_ok=True)
            base = out_html.as_uri()
            with tempfile.TemporaryDirectory() as tmp:
                tmp = Path(tmp)
                info = chromekit.dom_json(chrome, tmp / "info", base + "?export#1", "export-info")
                chk = chromekit.dom_json(chrome, tmp / "chk", base + "?check", "check-info", budget=6000)
                res["layout_issues"] = chk["issues"][:60]
                jobs = [(i, sl["steps"], shots / f"s{i + 1}.png") for i, sl in enumerate(info["slides"])]
                for n in steps_for:
                    if 1 <= n <= len(info["slides"]):
                        jobs += [(n - 1, k, shots / f"s{n}_{k}.png") for k in range(info["slides"][n - 1]["steps"] + 1)]
                with ThreadPoolExecutor(max_workers=6) as ex:
                    list(ex.map(lambda j: shoot(chrome, tmp, base, *j), jobs))
            sheet([(str(i + 1), shots / f"s{i + 1}.png") for i in range(len(info["slides"]))], work / "preview.png")
            res["preview"] = str(work / "preview.png")
            for n in steps_for:
                st = info["slides"][n - 1]["steps"]
                sheet([(f"{n}.{k}", shots / f"s{n}_{k}.png") for k in range(st + 1)], work / f"steps-{n}.png", cols=2)
            if steps_for:
                res["steps"] = [str(work / f"steps-{n}.png") for n in steps_for]
            res["slides"] = len(info["slides"])
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
