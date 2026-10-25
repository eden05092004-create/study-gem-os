# אוצר הרכיבים

כל הרכיבים נמצאים ב-`assets/components.css` ונטענים תמיד. **המיקום** (left/top/width) נקבע ב-`style.css` של המצגת, לפי מחלקה של השקף (`.u3 .q{...}`). צבע של רכיב: `--c` עליו (`style="--c:var(--gold)"`).
אייקונים: `{{ICON:שם}}` (Lucide). חיפוש שם: `run.sh icons heart`.
דוגמאות מלאות: `example-usa/` (ארכיון וצילומים אמיתיים) ו-`example-narcissism.html` (תרשימים, מוקאפים, תמונות AI).

## שלד שקף
```html
<section class="slide glow u3" data-title="שם קצר לניווט" style="--ga:var(--teal);--gb:var(--gold)">
  <h2 class="t">כותרת</h2>               <!-- כותרת למעלה במרכז -->
  ...
  <div class="notes"></div>              <!-- הערות דובר (ריק אם לא הגיעו עם התוכן) -->
</section>
```
- `.glow`: רקע גרדיאנט עם שני זוהרים (`--ga`, `--gb`, מיקום `--gx --gy --hx --hy`). בלי `.glow` הרקע הוא `--bg` (בשקפי תמונה מלאה).
- `.lead` במקום `.t`: כותרת ענקית במרכז שעולה למעלה בלחיצה הראשונה (השקף מקבל `at1`). `<br>` בתוכה נעלם כשהיא קטנה.

## בילדאפ
`class="b"` נחשף בלחיצה. `data-g="2"` קובע באיזו לחיצה (כמה אלמנטים עם אותו מספר נחשפים יחד). השקף מקבל `at1`, `at2`... ולכן כל CSS יכול לשנות קומפוזיציה: `.u7.at1 .dark{opacity:1}`.

## מרכז ובועות (מושגים סביב ליבה)
```html
<svg class="wires" viewBox="0 0 1920 1080">
  <g class="b" data-g="1" style="--c:var(--amber)"><path class="w0" pathLength="1" d="M1045 505 Q1120 372 1185 368"/><path class="w1" pathLength="1" d="M1045 505 Q1120 372 1185 368"/></g>
</svg>
<div class="core pulse" style="--c:#e0466b;left:860px;top:455px">{{ICON:heart-crack}}</div>
<div class="gcard fly b" data-g="1" style="--c:var(--amber);left:1180px;top:262px;width:640px;--fx:-300px;--fy:180px">
  <div class="hd"><span class="tile">{{ICON:crown}}</span><h3>שם המושג</h3></div>
  <q>"ציטוט או הסבר"</q>
</div>
```
- `.orb.spin` במקום `.core`: "עצמי" ניטרלי שמקבל זוהר עם כל חיבור (`.uX.at2 .orb{box-shadow:...}`).
- החוט: שני `path` זהים, `w0` הקו שנמתח ו-`w1` זרימה. מחשבים את הנקודות לפי המיקומים.

## מילון
```html
<div class="dict b" style="--c:var(--violet);left:330px;top:340px;width:1260px">
  <div class="term"><b>זולת־עצמי</b><span class="en">(Selfobject)</span></div>
  <p>ההגדרה...</p>
</div>
```

## מוקאפ שיחה
```html
<div class="chat" style="left:1010px;top:182px;width:800px">
  <div class="bar"><i></i><i></i><i></i><span>כותרת החלון</span></div>
  <div class="msgs">
    <div class="msg typing" style="--c:#e8577a"><span class="av">{{ICON:user-round}}</span>
      <div><div class="who">מטופל:</div><div class="dots"><i></i><i></i><i></i></div><div class="bub">"..."</div></div></div>
    <div class="msg other typing b" data-g="1" style="--c:#1fb5a4"><span class="av">{{ICON:heart-handshake}}</span>
      <div><div class="who">מטפלת:</div><div class="dots"><i></i><i></i><i></i></div><div class="bub">"..."</div></div></div>
  </div>
</div>
```
`.typing`: נקודות "מקליד" ואז ההודעה. הודעה בלי `.b` מוקלדת כשהשקף נפתח.

## תיק עם לשוניות
```html
<div class="file b" data-g="1" style="left:250px;top:170px;width:1420px">
  <div class="tabs"><div class="tab t1" style="--c:var(--sky)">{{ICON:user-round}}הרקע</div>...</div>
  <div class="paper" style="height:690px"><div class="redact"><i style="width:150px"></i><i style="width:90px"></i></div>
    <div class="stack" style="padding:80px 110px"><div class="pg">...</div><div class="pg b" data-g="2">...</div></div></div>
</div>
```
ב-CSS: `.uX.at2 .t2{...}` להדלקת הלשונית, ו-`.stack` מחליף עמודים באותו מקום (רק האחרון שנחשף גלוי).

## שכבות "מה מתחת"
```html
<div class="berg b" style="position:absolute;left:110px;top:200px;width:800px">
  <h4>מאחורי ההאשמה עשויים להימצא</h4>
  <div class="sea" style="height:560px">
    <div class="layer" style="top:60px;width:440px;background:rgba(255,107,138,.22)">פחד מכישלון,</div>
    <div class="layer" style="top:220px;width:580px;transition-delay:.6s">...</div>
  </div>
</div>
```

## מונה, מסילה, פסק דין, משפט עם קו
```html
<b class="num" data-count="620,000">620,000</b>            <!-- סופר כשנחשף; הטקסט = הערך הסופי -->
<div class="rail" style="--c:var(--gold);left:420px;right:420px;top:740px">
  <div class="stop"><span class="when">1789:</span><div class="what">...</div></div>
  <div class="stop b"><span class="when">1791:</span><div class="what">...</div></div>
</div>
<div class="verdict b" style="--c:var(--gold)"><i class="rule"></i><p>המשפט הגדול.</p></div>
<div class="punch b" style="--c:var(--teal);top:900px"><span>משפט סיום עם קו שנמתח.</span></div>
```
**מונה שחוזר על מספר מהטקסט** (למשל 620,000 ענק מעל המשפט "יותר מ-620,000 הרוגים") מקבל `data-deco` כדי שבדיקת הנאמנות לא תספור אותו כתוספת. `data-deco` רק למילים שכבר קיימות בתוכן.

## תמונות
ראה images.md: `.kbw > .full.kb`, `.half`, `.frame`, `.print-photo`, `.tone-sepia`, `.tone-bw`, `.shade-b`, `.shade-t`, `.shade-all`, `.on-img`, `.credit`.

## אובייקטים מצוירים (SVG)
כוכבים, דגל, מפה פשוטה, נקודות על קו חוף: ב-SVG בתוך השקף (לא תווים כמו ★, הם נספרים כאימוג'י). אפשר לייצר אותם בסקריפט פייתון קצר שכותב את slides.html, כמו בדוגמה של ארצות הברית (13 כוכבים במעגל, 50 כוכבים בדגל).
