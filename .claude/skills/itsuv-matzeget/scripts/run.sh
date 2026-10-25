#!/bin/bash
# נקודת הכניסה לכל הפעולות של סקיל "עיצוב מצגת".
#
#   run.sh new     <נושא>                      יוצר תיקיית מצגת חדשה בתוך ./מצגות ומדפיס את הנתיב
#   run.sh build   <תיקייה>                    בונה את קובץ ה-HTML לשליחה
#   run.sh check   <תיקייה> [--steps 3,5] [--fast]   נאמנות לתוכן, סימני AI, בעיות פריסה, ותמונות מבט-על
#   run.sh open    <תיקייה>                    מפעיל את השרת המקומי ופותח את המצגת בדפדפן (עם מצב עריכה)
#   run.sh wait    <תיקייה> [שניות]            מחכה לבקשה מהמצגת או ל"סיימתי"
#   run.sh export  <תיקייה> [--only pptx|pdf] [--flat]   PowerPoint ו/או PDF ליד המצגת
#   run.sh photos  "<חיפוש באנגלית>" <תיקייה> [--n 8]    מחפש צילומים אמיתיים בוויקישיתוף, ושומר דף מועמדים
#   run.sh photo   <מספר> "<חיפוש>" <תיקייה> <media/שם.jpg>  מוריד את המועמד שנבחר ומדפיס קרדיט
#   run.sh pics    <photos.json> <תיקייה>     כל התמונות במקביל: חיפוש, בחירה אוטומטית, הורדה, דף אחד לבדיקה
#   run.sh brand   url|logo <ערך> <תיקייה>     שולף לוגו, צבעים ופונט מאתר או מקובץ לוגו
#   run.sh icons   <מילה באנגלית>              מחפש אייקונים מתאימים
#   run.sh folder  <תיקייה>                    פותח את התיקייה ב-Finder
#   run.sh stop    <תיקייה>                    עוצר את השרת המקומי
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"

find_python() {
  local need="$1" c
  for c in \
    "$HOME/.cache/itsuv-matzeget/venv/bin/python3" \
    "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" \
    "$(command -v python3 2>/dev/null)"; do
    if [ -n "$c" ] && [ -x "$c" ] && "$c" -c "import $need" >/dev/null 2>&1; then echo "$c"; return 0; fi
  done
  return 1
}
setup_python() {
  echo "מתקין פעם אחת את הספריות לייצוא (Pillow, python-pptx)..." >&2
  python3 -m venv "$HOME/.cache/itsuv-matzeget/venv" >&2 && \
  "$HOME/.cache/itsuv-matzeget/venv/bin/pip" install -q pillow python-pptx >&2 && \
  echo "$HOME/.cache/itsuv-matzeget/venv/bin/python3"
}
PY="$(find_python PIL)" || PY="$(setup_python)" || { echo "לא הצלחתי להכין Python עם Pillow. בדקו חיבור לאינטרנט ונסו שוב."; exit 3; }

action="${1:-}"; shift || true
url_of() { "$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["url"])' "$1/.work/server.json" 2>/dev/null; }
alive() { local u; u="$(url_of "$1")" && curl -s -m 2 "${u}api/version" >/dev/null 2>&1; }

case "$action" in
  new)
    topic="$*"
    name="$(printf '%s' "$topic" | tr '/:*?"<>|' '        ' | sed 's/  */ /g; s/^ //; s/ $//' | cut -c1-80)"
    [ -z "$name" ] && name="מצגת"
    dir="$PWD/מצגות/$name"; n=2
    while [ -e "$dir" ]; do dir="$PWD/מצגות/$name ($n)"; n=$((n+1)); done
    mkdir -p "$dir/media" "$dir/.work"
    echo "$dir"
    ;;
  build)
    "$PY" "$HERE/build.py" "$1"
    ;;
  check)
    d="$1"; shift
    "$PY" "$HERE/check.py" "$d" "$@"
    ;;
  open)
    d="$(cd "$1" && pwd)"
    if ! alive "$d"; then
      rm -f "$d/.work/server.json"
      "$PY" "$HERE/server.py" "$d" --port 8765 --daemon
      for _ in $(seq 1 80); do [ -f "$d/.work/server.json" ] && break; sleep 0.1; done
    fi
    u="$(url_of "$d")" || { echo "השרת לא עלה:"; tail -20 "$d/.work/server.log" 2>/dev/null; exit 1; }
    "$PY" "$HERE/build.py" "$d" >/dev/null
    [ "${NO_BROWSER:-0}" = "1" ] || open "$u" 2>/dev/null || xdg-open "$u" 2>/dev/null || true
    echo "OPEN $u"
    ;;
  wait)
    "$PY" "$HERE/wait.py" "$1" --timeout "${2:-3000}"
    ;;
  export)
    d="$1"; shift
    PX="$(find_python pptx)" || PX="$(setup_python)" || { echo "לא הצלחתי להתקין python-pptx."; exit 3; }
    f="$("$PY" "$HERE/build.py" "$d" | "$PY" -c 'import json,sys;print(json.load(sys.stdin)["html"])')"
    "$PX" "$HERE/export.py" "$f" "$@"
    ;;
  photos)
    "$PY" "$HERE/photos.py" search "$@"
    ;;
  pics)
    "$PY" "$HERE/photos.py" batch "$1" "$2"
    ;;
  photo)
    "$PY" "$HERE/photos.py" get "$@"
    ;;
  brand)
    "$PY" "$HERE/brand.py" "$1" "$2" "$3"
    ;;
  icons)
    "$PY" - "$HERE/../assets/icons/lucide.json" "$*" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1])); q = sys.argv[2].lower().split()
hits = [n for n in d["icons"] if all(w in n or any(w in t for t in d["tags"].get(n, [])) for w in q)]
print(" ".join(hits[:60]) or "לא נמצא. נסו מילה אחרת באנגלית.")
EOF
    ;;
  folder)
    open "$1" 2>/dev/null || xdg-open "$1" 2>/dev/null; echo "$1"
    ;;
  stop)
    pid="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1]))["pid"])' "$1/.work/server.json" 2>/dev/null)"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -f "$1/.work/server.json"; echo "stopped"
    ;;
  *)
    sed -n '2,17p' "$0"; exit 2
    ;;
esac
