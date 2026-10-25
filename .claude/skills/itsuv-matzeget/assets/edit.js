/* ============================================================
   עיצוב מצגת: מצב עריכה
   נטען רק כשהמצגת פתוחה דרך השרת המקומי (run.sh open). כל שינוי נשמר מיד ל-slides.html.
   - לחיצה על אלמנט: בחירה. גרירה: הזזה (עם קווי עזר למרכז). לחיצה כפולה: עריכת טקסט.
   - סרגל צף: פונט, גודל, מודגש, צבע, בחירת המסגרת, החלפת תמונה, תמונת AI, מחיקה.
   - סרגל עליון: ביטול/חזרה, שכפול/מחיקה/סדר שקפים, שקף חדש (דרך Claude), תיבת טקסט, תמונה, QR,
     פונט המצגת, הערות דובר, בקשה ל-Claude, סיימתי.
   ============================================================ */
(function(){
const root = document.documentElement, stage = document.getElementById('stage');
const D = window.deck;
const FONTS = window.DECK_FONTS || [];
const ICON = {
  undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo:'<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  copy:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  grid:'<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  text:'<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  image:'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  qr:'<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  notes:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/>',
  chat:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  up:'<path d="m18 15-6-6-6 6"/>',
  spark:'<path d="M9.94 14.06 4 20"/><path d="m14 4 1.5 3.5L19 9l-3.5 1.5L14 14l-1.5-3.5L9 9l3.5-1.5Z"/>',
  close:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
};
const ic = n => '<svg viewBox="0 0 24 24">' + ICON[n] + '</svg>';

/* ---------- ממשק ---------- */
const ui = document.createElement('div'); ui.id = 'edit-ui';
ui.innerHTML = `
<div class="etop">
  <span class="ttl">מצב עריכה</span>
  <button class="eb" data-a="undo" title="ביטול (⌘Z)">${ic('undo')}ביטול</button>
  <button class="eb" data-a="redo" title="חזרה (⇧⌘Z)">${ic('redo')}חזרה</button>
  <span class="sep"></span>
  <button class="eb" data-a="addSlide" title="Claude יבנה שקף חדש בסגנון המצגת">${ic('plus')}שקף חדש</button>
  <button class="eb" data-a="dupSlide">${ic('copy')}שכפול שקף</button>
  <button class="eb danger" data-a="delSlide">${ic('trash')}מחיקת שקף</button>
  <button class="eb" data-a="order">${ic('grid')}סדר השקפים</button>
  <span class="sep"></span>
  <button class="eb" data-a="addText">${ic('text')}תיבת טקסט</button>
  <button class="eb" data-a="addImage">${ic('image')}תמונה</button>
  <button class="eb" data-a="addQR">${ic('qr')}QR</button>
  <select data-a="deckFont" title="הפונט של כל המצגת"><option value="">פונט המצגת</option></select>
  <button class="eb" data-a="notes">${ic('notes')}הערות דובר</button>
  <span class="status"></span>
  <button class="eb claude" data-a="ask" title="לבקש מ-Claude כל שינוי אחר">${ic('chat')}בקשה ל-Claude</button>
  <button class="eb primary" data-a="done">${ic('check')}סיימתי</button>
  <button class="eb" data-a="exit" title="יציאה ממצב עריכה">${ic('close')}</button>
</div>
<div class="efloat">
  <select data-f="font" title="פונט"></select>
  <button class="eb" data-f="smaller" title="הקטנה"><span dir="ltr">A−</span></button>
  <button class="eb" data-f="bigger" title="הגדלה"><span dir="ltr">A+</span></button>
  <button class="eb" data-f="bold" title="מודגש"><b>B</b></button>
  <input type="color" data-f="color" title="צבע">
  <button class="eb" data-f="parent" title="בחירת המסגרת שמסביב">${ic('up')}</button>
  <button class="eb" data-f="replace" title="החלפת תמונה מהמחשב">${ic('image')}החלפה</button>
  <button class="eb" data-f="ai" title="תמונה חדשה עם AI, דרך Claude">${ic('spark')}AI</button>
  <button class="eb danger" data-f="del" title="מחיקה (Delete)">${ic('trash')}</button>
  <span class="hint">לחיצה כפולה לעריכת טקסט</span>
</div>
<div class="enotes"><label>הערות דובר לשקף הזה (יופיעו רק בחלון ההערות, לא על המסך)</label><textarea placeholder="כתבו כאן מה להגיד בשקף הזה..."></textarea></div>
<div class="edlg"><div class="box"><h3></h3><p></p><div class="fields"></div><div class="row"><button class="eb primary" data-d="ok">אישור</button><button class="eb" data-d="cancel">ביטול</button></div></div></div>
<div class="edone"><div class="box"><h2>נשמר!</h2><p>חזרו לשיחה עם Claude.<br>הוא ישאל אם לייצא את המצגת גם ל-PowerPoint או ל-PDF.<br>אפשר לחזור לעריכה בכל רגע.</p><br><button class="eb" data-a="back">חזרה לעריכה</button></div></div>
<input type="file" accept="image/*" hidden>
<div class="guide v"></div><div class="guide h"></div>`;
document.body.appendChild(ui);
const $ = q => ui.querySelector(q);
const top = $('.etop'), flt = $('.efloat'), statusEl = $('.status'), fileIn = ui.querySelector('input[type=file]');
const gV = $('.guide.v'), gH = $('.guide.h');

FONTS.forEach(f=>{
  [$('[data-a="deckFont"]'), $('[data-f="font"]')].forEach(sel=>{ const o = document.createElement('option'); o.value = f.name; o.textContent = f.label; o.style.fontFamily = `'${f.name}'`; sel.appendChild(o); });
});
$('[data-f="font"]').insertAdjacentHTML('afterbegin', '<option value="">פונט</option>');

/* ---------- מצב ---------- */
let editing = false, sel = null, textEl = null, dirty = false, saving = false, dragging = false;
const undoStack = [], redoStack = [];
const rootVars = Object.assign({}, window.DECK_ROOT || {});
const cur = ()=> D.slides[D.index];
const zoom = ()=> parseFloat(getComputedStyle(root).getPropertyValue('--zoom')) || 1;

function setStatus(t){ statusEl.textContent = t; }

/* ---------- ניקוי לפני שמירה: מוציא את כל מה שהנגן מוסיף בזמן ריצה ---------- */
const RUNTIME = /^(active|in|past|gone|sel|hov|at\d+)$/;
function cleanHTML(){
  const box = document.createElement('div');
  D.slides.forEach(sl=>{
    const c = sl.cloneNode(true);
    [c, ...c.querySelectorAll('*')].forEach(el=>{
      if (el.classList) [...el.classList].forEach(k=>{ if (RUNTIME.test(k)) el.classList.remove(k); });
      if (el.getAttribute && el.getAttribute('class') === '') el.removeAttribute('class');
      ['contenteditable','spellcheck','data-run','data-on'].forEach(a=>el.removeAttribute && el.removeAttribute(a));
      if (el.getAttribute && el.getAttribute('style') === '') el.removeAttribute('style');
    });
    c.querySelectorAll('[data-count]').forEach(e=>{ e.textContent = e.dataset.count; });
    c.querySelectorAll('[data-qr]').forEach(e=>{ e.innerHTML = ''; });
    box.appendChild(c); box.appendChild(document.createTextNode('\n\n'));
  });
  return box.innerHTML;
}

/* ---------- ביטול וחזרה ---------- */
function snapshot(){ undoStack.push({html: cleanHTML(), s: D.index}); if (undoStack.length > 60) undoStack.shift(); redoStack.length = 0; syncUndo(); }
function restore(from, to){
  const st = from.pop(); if (!st) return;
  to.push({html: cleanHTML(), s: D.index});
  stage.querySelectorAll(':scope > .slide').forEach(e=>e.remove());
  stage.insertAdjacentHTML('afterbegin', st.html);
  deselect(); D.refresh(Math.min(st.s, stage.querySelectorAll(':scope > .slide').length-1)); changed(); syncUndo();
}
function syncUndo(){ $('[data-a="undo"]').disabled = !undoStack.length; $('[data-a="redo"]').disabled = !redoStack.length; }

/* ---------- שמירה ---------- */
let saveT;
function changed(){ dirty = true; setStatus('שומר...'); clearTimeout(saveT); saveT = setTimeout(save, 700); }
async function save(){
  if (saving){ clearTimeout(saveT); saveT = setTimeout(save, 400); return; }
  saving = true;
  try{
    const r = await fetch('/api/save', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({html: cleanHTML(), root: rootVars})});
    const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status);
    D.version = j.v; dirty = false; setStatus('נשמר');
  }catch(e){ setStatus('השמירה נכשלה'); D.toast('השמירה נכשלה: ' + e.message + '. השרת המקומי עדיין פועל?'); }
  saving = false;
}

/* ---------- בחירה ---------- */
function pick(t){
  if (!t || !stage.contains(t)) return null;
  const sl = t.closest('.slide'); if (!sl || sl !== cur()) return null;
  let el = t.closest('svg') && !t.closest('svg.wires') ? t.closest('svg').parentElement : t;
  if (el.closest('svg.wires')) return null;
  if (el === sl) return null;
  while (el.parentElement && el.parentElement !== sl && getComputedStyle(el).display.startsWith('inline') && !el.matches('img,video,.tile,.num')) el = el.parentElement;
  return el;
}
function select(el){
  if (sel === el) return;
  deselect(); sel = el; if (!el) return;
  el.classList.add('sel'); placeFloat();
  const isImg = el.matches('img,video');
  flt.querySelector('[data-f="replace"]').style.display = isImg ? '' : 'none';
  flt.querySelector('[data-f="ai"]').style.display = isImg ? '' : 'none';
  ['font','smaller','bigger','bold','color'].forEach(k=>flt.querySelector(`[data-f="${k}"]`).style.display = isImg ? 'none' : '');
  const cs = getComputedStyle(el);
  const fam = cs.fontFamily.split(',')[0].replace(/["']/g,'').trim();
  flt.querySelector('[data-f="font"]').value = FONTS.some(f=>f.name===fam) ? fam : '';
  flt.querySelector('[data-f="color"]').value = toHex(cs.color);
}
function deselect(){ stopText(); if (sel) sel.classList.remove('sel'); sel = null; flt.classList.remove('show'); }
function placeFloat(){
  if (!sel){ flt.classList.remove('show'); return; }
  const r = sel.getBoundingClientRect(); flt.classList.add('show');
  const fw = flt.offsetWidth, fh = flt.offsetHeight;
  let y = r.top - fh - 12; if (y < 60) y = r.bottom + 12;
  let x = r.left + r.width/2 - fw/2; x = Math.max(8, Math.min(innerWidth - fw - 8, x));
  flt.style.left = x + 'px'; flt.style.top = Math.min(innerHeight - fh - 8, y) + 'px';
}
function toHex(c){ const m = c.match(/\d+(\.\d+)?/g); if (!m) return '#ffffff'; return '#' + m.slice(0,3).map(v=>(+v|0).toString(16).padStart(2,'0')).join(''); }

/* ---------- עריכת טקסט ---------- */
let textBefore = null;
function startText(el){
  if (el.matches('img,video,svg') || !el.textContent.trim() && !el.matches('.tbox')) return;
  select(el); textEl = el; textBefore = cleanHTML();
  el.setAttribute('contenteditable','true'); el.setAttribute('spellcheck','false'); el.focus();
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function stopText(){
  if (!textEl) return;
  textEl.removeAttribute('contenteditable'); textEl.removeAttribute('spellcheck');
  const after = cleanHTML();
  if (after !== textBefore){ undoStack.push({html: textBefore, s: D.index}); redoStack.length = 0; syncUndo(); changed(); }
  textEl = null; textBefore = null;
}

/* ---------- הזזה עם קווי עזר ---------- */
function getT(el){ const m = (el.style.translate || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px/); return m ? [+m[1], +m[2]] : [0,0]; }
let drag = null;
stage.addEventListener('pointerdown', e=>{
  if (!editing || e.button !== 0) return;
  if (textEl && textEl.contains(e.target)) return;
  const el = pick(e.target);
  if (!el){ deselect(); return; }
  e.preventDefault();
  if (sel !== el) select(el);
  drag = {el, x:e.clientX, y:e.clientY, t:getT(el), moved:false};
  el.setPointerCapture && el.setPointerCapture(e.pointerId);
}, true);
addEventListener('pointermove', e=>{
  if (!editing) return;
  if (!drag){
    stage.querySelectorAll('.hov').forEach(h=>h.classList.remove('hov'));
    const h = pick(e.target); if (h && h !== sel) h.classList.add('hov');
    return;
  }
  const z = zoom(); let dx = (e.clientX - drag.x)/z, dy = (e.clientY - drag.y)/z;
  if (!drag.moved){ if (Math.hypot(dx,dy) < 4) return; drag.moved = true; dragging = true; snapshot(); }
  drag.el.style.translate = (drag.t[0]+dx) + 'px ' + (drag.t[1]+dy) + 'px';
  /* הצמדה למרכז השקף */
  const S = stage.getBoundingClientRect(), r = drag.el.getBoundingClientRect();
  const cx = (r.left + r.width/2 - S.left)/z, cy = (r.top + r.height/2 - S.top)/z;
  let sx = 0, sy = 0; gV.style.display = gH.style.display = 'none';
  if (Math.abs(cx - 960) < 10){ sx = 960 - cx; gV.style.display = 'block'; gV.style.left = (S.left + 960*z) + 'px'; }
  if (Math.abs(cy - 540) < 10){ sy = 540 - cy; gH.style.display = 'block'; gH.style.top = (S.top + 540*z) + 'px'; }
  if (sx || sy) drag.el.style.translate = (drag.t[0]+dx+sx) + 'px ' + (drag.t[1]+dy+sy) + 'px';
  placeFloat();
});
addEventListener('pointerup', ()=>{
  if (!drag) return;
  if (drag.moved) changed();
  drag = null; dragging = false; gV.style.display = gH.style.display = 'none';
});
stage.addEventListener('dblclick', e=>{ if (!editing) return; const el = pick(e.target); if (el) startText(el); }, true);
stage.addEventListener('click', e=>{ if (editing && !(textEl && textEl.contains(e.target))) e.preventDefault(); }, true);

/* ---------- סרגל צף ---------- */
flt.addEventListener('pointerdown', e=>e.stopPropagation());
flt.addEventListener('click', e=>{
  const b = e.target.closest('[data-f]'); if (!b || !sel) return;
  const f = b.dataset.f, cs = getComputedStyle(sel);
  if (f === 'bigger' || f === 'smaller'){ snapshot(); const px = parseFloat(cs.fontSize) * (f === 'bigger' ? 1.08 : 1/1.08); sel.style.fontSize = Math.round(px) + 'px'; changed(); placeFloat(); }
  else if (f === 'bold'){ snapshot(); sel.style.fontWeight = (+cs.fontWeight >= 700) ? '400' : '800'; changed(); }
  else if (f === 'parent'){ const p = sel.parentElement; if (p && !p.classList.contains('slide')) select(p); }
  else if (f === 'del'){ snapshot(); const x = sel; deselect(); x.remove(); changed(); }
  else if (f === 'replace'){ pendingImg = sel; fileIn.click(); }
  else if (f === 'ai'){ aiImage(sel); }
});
flt.querySelector('[data-f="font"]').addEventListener('change', e=>{ if (!sel || !e.target.value) return; snapshot(); sel.style.fontFamily = `'${e.target.value}'`; changed(); });
flt.querySelector('[data-f="color"]').addEventListener('change', e=>{ if (!sel) return; snapshot(); sel.style.color = e.target.value; changed(); });

/* ---------- חלון שאלה ---------- */
function ask(title, desc, fields){
  return new Promise(res=>{
    const d = $('.edlg'); d.querySelector('h3').textContent = title; d.querySelector('p').textContent = desc || '';
    const box = d.querySelector('.fields'); box.innerHTML = '';
    fields.forEach(f=>{ const el = document.createElement(f.area ? 'textarea' : 'input'); el.placeholder = f.ph || ''; el.value = f.value || ''; el.dataset.k = f.k; box.appendChild(el); });
    d.classList.add('show'); const first = box.querySelector('input,textarea'); if (first) setTimeout(()=>first.focus(), 30);
    const done = ok=>{ d.classList.remove('show'); d.onclick = null; if (!ok) return res(null); const out = {}; box.querySelectorAll('[data-k]').forEach(x=>out[x.dataset.k] = x.value.trim()); res(out); };
    d.onclick = e=>{ const b = e.target.closest('[data-d]'); if (b) done(b.dataset.d === 'ok'); else if (e.target === d) done(false); };
    box.onkeydown = e=>{ if (e.key === 'Enter' && e.target.tagName === 'INPUT'){ e.preventDefault(); done(true); } if (e.key === 'Escape') done(false); };
  });
}

/* ---------- בקשות ל-Claude ---------- */
async function request(obj, msg){
  try{
    const r = await fetch('/api/request', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(obj)});
    if (!r.ok) throw new Error(r.status);
    D.toast(msg || 'הבקשה נשלחה ל-Claude. השינוי יופיע כאן לבד בעוד רגע.', 6000);
  }catch(e){ D.toast('לא הצלחתי לשלוח. אפשר לכתוב את הבקשה ישירות בשיחה עם Claude.'); }
}
function eid(el){ if (!el.dataset.eid){ el.dataset.eid = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); changed(); } return el.dataset.eid; }
async function aiImage(el){
  const a = await ask('תמונה חדשה עם AI', 'תארו מה רוצים לראות, או השאירו ריק ו-Claude יחליט לפי השקף.', [{k:'text', ph:'למשל: צילום שחור-לבן של...', area:true}]);
  if (!a) return;
  await save();
  request({type:'ai-image', slide: D.index+1, eid: eid(el), text: a.text});
}

/* ---------- תמונות מהמחשב ---------- */
let pendingImg = null;
fileIn.addEventListener('change', async ()=>{
  const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
  if (f.size > 25e6){ D.toast('הקובץ גדול מדי (עד 25MB)'); return; }
  setStatus('מעלה תמונה...'); dirty = true;
  const data = await new Promise(r=>{ const fr = new FileReader(); fr.onload = ()=>r(fr.result.split(',')[1]); fr.readAsDataURL(f); });
  try{
    const r = await fetch('/api/upload', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name: f.name, data})});
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    snapshot();
    if (pendingImg && pendingImg.matches('img')){ pendingImg.src = j.src; pendingImg.removeAttribute('srcset'); }
    else {
      const fr = document.createElement('div'); fr.className = 'frame'; fr.style.cssText = 'left:560px;top:240px;width:800px;height:600px;z-index:15';
      fr.innerHTML = '<img src="' + j.src + '" alt="">'; cur().appendChild(fr); select(fr);
    }
    pendingImg = null; changed();
  }catch(e){ setStatus(''); D.toast('ההעלאה נכשלה: ' + e.message); }
});

/* ---------- פעולות הסרגל העליון ---------- */
const A = {
  undo: ()=>restore(undoStack, redoStack),
  redo: ()=>restore(redoStack, undoStack),
  async addSlide(){
    const a = await ask('שקף חדש', 'על מה השקף? Claude יבנה אותו בסגנון של המצגת, אחרי השקף הנוכחי.', [{k:'text', ph:'למשל: שקף על ההשקעה של אינטל בישראל, עם תמונה', area:true}]);
    if (!a || !a.text) return; await save();
    request({type:'add-slide', after: D.index+1, text: a.text}, 'Claude בונה את השקף. הוא יופיע כאן לבד בעוד רגע.');
  },
  dupSlide(){ snapshot(); const c = cur().cloneNode(true); [c, ...c.querySelectorAll('.sel,.hov')].forEach(e=>e.classList.remove('active','sel','hov')); cur().after(c); D.refresh(D.index+1); changed(); },
  async delSlide(){
    if (D.slides.length < 2) return D.toast('אי אפשר למחוק את השקף היחיד');
    const a = await ask('למחוק את השקף?', 'שקף ' + (D.index+1) + ': ' + (cur().dataset.title||'') + '. אפשר לבטל עם "ביטול".', []);
    if (!a) return; snapshot(); deselect(); const i = D.index; cur().remove(); D.refresh(Math.max(0, i-1)); changed();
  },
  order(){ deselect(); D.openGrid(); },
  addText(){ snapshot(); const t = document.createElement('div'); t.className = 'tbox'; t.style.cssText = 'left:760px;top:490px'; t.textContent = 'טקסט חדש'; cur().appendChild(t); changed(); startText(t);
    const r = document.createRange(); r.selectNodeContents(t); getSelection().removeAllRanges(); getSelection().addRange(r); },
  addImage(){ pendingImg = null; fileIn.click(); },
  async addQR(){
    const a = await ask('קוד QR', 'הקוד נוצר כאן במחשב, בלי אינטרנט. הכיתוב יופיע מתחת לקוד.', [{k:'url', ph:'הלינק, למשל https://...'}, {k:'cap', ph:'כיתוב (לא חובה), למשל: סרקו להרשמה'}]);
    if (!a || !a.url) return;
    snapshot(); const q = document.createElement('div'); q.className = 'qrbox'; q.style.cssText = 'left:780px;top:300px';
    const code = document.createElement('div'); code.className = 'qr'; code.dataset.qr = a.url; q.appendChild(code);
    if (a.cap){ const c = document.createElement('div'); c.className = 'cap'; c.textContent = a.cap; q.appendChild(c); }
    cur().appendChild(q); D.refresh(D.index); changed();
  },
  notes(){ root.classList.toggle('notes-open'); syncNotes(); D.fit(); },
  async ask(){
    const a = await ask('בקשה ל-Claude', 'כל שינוי שלא נמצא בכפתורים: תרשים, וידאו, לינק, שינוי פריסה, צבעים, איחוד שקפים...', [{k:'text', ph:'מה לשנות? (השקף הנוכחי: ' + (D.index+1) + ')', area:true}]);
    if (!a || !a.text) return; await save();
    request({type:'free', slide: D.index+1, eid: sel ? eid(sel) : null, text: a.text});
  },
  async done(){ deselect(); await save(); try{ await fetch('/api/done', {method:'POST'}); }catch(e){} $('.edone').classList.add('show'); },
  back(){ $('.edone').classList.remove('show'); },
  exit(){ toggle(false); }
};
ui.addEventListener('click', e=>{ const b = e.target.closest('[data-a]'); if (b && b.tagName === 'BUTTON' && A[b.dataset.a]) A[b.dataset.a](); });
$('[data-a="deckFont"]').addEventListener('change', e=>{
  const v = e.target.value; if (!v) return; snapshot();
  rootVars['--font-display'] = `'${v}'`; rootVars['--font-body'] = `'${v}'`; applyRoot(); changed(); e.target.value = '';
  D.toast('הפונט של כל המצגת הוחלף ל-' + v);
});
function applyRoot(){ Object.entries(rootVars).forEach(([k,v])=>root.style.setProperty(k, v)); }
applyRoot();

/* ---------- הערות דובר ---------- */
const ta = $('.enotes textarea'); let notesBefore = null;
function syncNotes(){ const n = cur().querySelector('.notes'); ta.value = n ? n.textContent.trim() : ''; }
ta.addEventListener('focus', ()=>{ notesBefore = cleanHTML(); });
ta.addEventListener('input', ()=>{
  let n = cur().querySelector('.notes'); if (!n){ n = document.createElement('div'); n.className = 'notes'; cur().appendChild(n); }
  n.textContent = ta.value; changed();
});
ta.addEventListener('blur', ()=>{ if (notesBefore && notesBefore !== cleanHTML()){ undoStack.push({html: notesBefore, s: D.index}); redoStack.length = 0; syncUndo(); } notesBefore = null; });
document.addEventListener('deck:render', ()=>{ if (editing){ deselect(); syncNotes(); } });

/* ---------- סדר השקפים: גרירה ברשת ---------- */
document.addEventListener('deck:grid', ()=>{
  const wrap = document.querySelector('#grid .wrap');
  wrap.querySelectorAll('.th').forEach(th=>{
    th.addEventListener('pointerdown', e=>{
      if (!editing || e.button !== 0) return;
      const from = +th.dataset.i; let moved = false, target = null, after = false;
      const mv = ev=>{
        if (!moved && Math.hypot(ev.clientX-e.clientX, ev.clientY-e.clientY) < 6) return;
        moved = true; th.classList.add('dragging'); th.dataset.dragged = '1';
        wrap.querySelectorAll('.th').forEach(x=>x.classList.remove('drop-before','drop-after'));
        const o = document.elementFromPoint(ev.clientX, ev.clientY); target = o && o.closest('#grid .th');
        if (target && target !== th){ const r = target.getBoundingClientRect(); after = ev.clientX < r.left + r.width/2; target.classList.add(after ? 'drop-after' : 'drop-before'); }
      };
      const up = ()=>{
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        th.classList.remove('dragging'); wrap.querySelectorAll('.th').forEach(x=>x.classList.remove('drop-before','drop-after'));
        setTimeout(()=>delete th.dataset.dragged, 50);
        if (!moved || !target || target === th) return;
        snapshot();
        const sl = D.slides[from], to = D.slides[+target.dataset.i];
        after ? to.after(sl) : to.before(sl);
        const ni = [...stage.querySelectorAll(':scope > .slide')].indexOf(sl);
        D.refresh(ni); changed(); D.openGrid();
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  });
});

/* ---------- מקשים ---------- */
addEventListener('keydown', e=>{
  if (!editing) return;
  const inText = e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !inText){ e.preventDefault(); e.stopImmediatePropagation(); (e.shiftKey ? A.redo : A.undo)(); return; }
  if (inText){ if (e.key === 'Escape'){ e.target.blur && e.target.blur(); deselect(); } e.stopImmediatePropagation(); return; }
  if (!sel) return;
  if (e.key === 'Escape'){ deselect(); e.stopImmediatePropagation(); }
  else if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); e.stopImmediatePropagation(); snapshot(); const x = sel; deselect(); x.remove(); changed(); }
  else if (e.key === 'Enter'){ e.preventDefault(); e.stopImmediatePropagation(); startText(sel); }
  else if (e.key.startsWith('Arrow')){
    e.preventDefault(); e.stopImmediatePropagation();
    const d = e.shiftKey ? 10 : 2, t = getT(sel);
    const k = {ArrowLeft:[-d,0], ArrowRight:[d,0], ArrowUp:[0,-d], ArrowDown:[0,d]}[e.key];
    snapshot(); sel.style.translate = (t[0]+k[0]) + 'px ' + (t[1]+k[1]) + 'px'; changed(); placeFloat();
  }
}, true);
addEventListener('resize', placeFloat);

/* ---------- כניסה ויציאה ---------- */
function toggle(on){
  editing = on; root.classList.toggle('editing', on);
  try{ on ? sessionStorage.setItem('deck-edit','1') : sessionStorage.removeItem('deck-edit'); }catch(e){}
  if (!on){ deselect(); root.classList.remove('notes-open'); }
  else { syncNotes(); syncUndo(); setStatus(dirty ? 'שומר...' : 'כל שינוי נשמר מיד'); }
  root.style.setProperty('--etop', (on ? top.offsetHeight : 0) + 'px');
  D.fit(); D.render();
}
addEventListener('resize', ()=>{ if (editing){ root.style.setProperty('--etop', top.offsetHeight + 'px'); D.fit(); } });
D.act.edit = ()=>toggle(!editing);
window.deckEdit = { busy: ()=> !!(dirty || saving || dragging || textEl || document.activeElement === ta || $('.edlg').classList.contains('show')), toggle };
try{ if (sessionStorage.getItem('deck-edit') === '1') toggle(true); }catch(e){}
})();
