/* ============================================================
   עיצוב מצגת: נגן המצגת
   קדימה: רווח / Enter / חץ ימינה / חץ למטה / PageDown / קליק
   אחורה: חץ שמאלה / חץ למעלה / PageUp / Backspace
   F מסך מלא, N חלון הערות, G כל השקפים, Esc סגירה
   בילדאפ: class="b" מופיע בלחיצה. "b w" מופיע יחד עם הקודם. data-g="N" קיבוץ מפורש.
   השקף מקבל at1, at2... לפי הלחיצה, כדי ש-CSS ישנה את כל הקומפוזיציה.
   ============================================================ */
(function(){
const Q = new URLSearchParams(location.search);
const EXPORT = Q.has('export'), PRINT = Q.has('print'), CHECK = Q.has('check');
const root = document.documentElement;
if (EXPORT || CHECK) root.classList.add('export');
if (PRINT || CHECK) root.classList.add('export','print');
if (CHECK) root.classList.add('check');
const DEV = root.classList.contains('dev');

const stage = document.getElementById('stage');
let slides = [...stage.querySelectorAll(':scope > .slide')];
const TITLE = (document.querySelector('meta[name="deck-title"]')||{}).content || document.title;
let s = 0, step = 0;

/* ---------- בילדאפים ---------- */
function groups(i){
  const sl = slides[i]; if (!sl) return [];
  const out = [], els = [...sl.querySelectorAll('.b')];
  if (els.some(el=>el.dataset.g)){
    els.forEach(el=>{ const g = (+el.dataset.g||1) - 1; (out[g] = out[g] || []).push(el); });
    return out.filter(Boolean);
  }
  els.forEach(el=>{ if (el.classList.contains('w') && out.length) out[out.length-1].push(el); else out.push([el]); });
  return out;
}

/* ---------- וידאו: data-sound מתנגן עם סאונד פעם אחת ואז ממשיך בשקט ---------- */
function setVideo(v, on){
  if (EXPORT || PRINT){ v.pause(); return; }
  if (on && v.dataset.on === '1'){ if (v.paused) v.play().catch(()=>{}); return; }
  if (!on && v.dataset.on !== '1') return;
  v.dataset.on = on ? '1' : '0';
  if (!on){ v.pause(); try{ v.currentTime = 0; }catch(e){} return; }
  if (v.hasAttribute('data-sound')){
    v.muted = false; v.loop = false;
    v.onended = ()=>{ v.muted = true; v.loop = true; v.play().catch(()=>{}); };
  }
  v.play().catch(()=>{ v.muted = true; v.play().catch(()=>{}); });
}

/* ---------- מספרים שסופרים למעלה: data-count="12,000,000" (הטקסט בתוך האלמנט הוא הערך הסופי) ---------- */
function countUp(el){
  if (el.dataset.run === '1' || EXPORT || PRINT || root.classList.contains('editing')) return;
  el.dataset.run = '1';
  const raw = el.dataset.count, m = raw.match(/^([^\d\-]*)(-?[\d,.]+)(.*)$/);
  if (!m) return;
  const target = parseFloat(m[2].replace(/,/g,'')), dec = (m[2].split('.')[1]||'').length, t0 = performance.now(), dur = +(el.dataset.dur||1600);
  const comma = m[2].includes(',');
  const fmt = v => m[1] + (comma ? v.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}) : v.toFixed(dec)) + m[3];
  (function tick(t){ const k = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-k,3); el.textContent = fmt(target*e); if (k<1) requestAnimationFrame(tick); else el.textContent = raw; })(t0);
}
function resetCount(el){ el.dataset.run = '0'; el.textContent = el.dataset.count; }

let bc = null; try{ bc = new BroadcastChannel('deck-' + location.pathname); }catch(e){}
const myId = Math.random().toString(36).slice(2);
if (bc) bc.onmessage = e=>{ if (e.data && e.data.from !== myId && e.data.type === 'claim') slides.forEach(sl=>sl.querySelectorAll('video').forEach(v=>{ v.muted = true; })); };

function applyState(i, k){
  const sl = slides[i], gs = groups(i);
  gs.forEach((g,gi)=>g.forEach(el=>{
    const on = gi < k;
    el.classList.toggle('in', on);
    (el.matches('video[data-autoplay]') ? [el] : el.querySelectorAll('video[data-autoplay]')).forEach(v=>setVideo(v, on && i===s));
    (el.matches('[data-count]') ? [el] : el.querySelectorAll('[data-count]')).forEach(c=>{ if (on && i===s) countUp(c); else if (!on) resetCount(c); });
  }));
  for (let n=1; n<=12; n++) sl.classList.toggle('at'+n, n<=k && n<=gs.length);
  choreo(sl, gs, k);
}

function render(){
  if (PRINT){ slides.forEach((sl,i)=>{ sl.classList.add('active'); applyState(i, groups(i).length); }); return; }
  if (bc && !EXPORT) bc.postMessage({type:'claim', from:myId});
  slides.forEach((el,i)=>el.classList.toggle('active', i===s));
  applyState(s, step);
  slides[s].querySelectorAll('.slide-count,[data-count]:not(.b [data-count]):not(.b[data-count])').forEach(c=>countUp(c));
  slides.forEach((el,i)=>{ if (i!==s) el.querySelectorAll('video').forEach(v=>setVideo(v,false)); });
  /* סאונד רק לסרטון האחרון שנחשף */
  let owner = null;
  groups(s).slice(0,step).forEach(g=>g.forEach(el=>{ const v = el.matches('video[data-sound]') ? el : el.querySelector('video[data-sound]'); if (v) owner = v; }));
  slides[s].querySelectorAll('video').forEach(v=>{ if (v !== owner) v.muted = true; });
  if (!EXPORT){
    const c = document.querySelector('#bar .count'); if (c) c.textContent = (s+1) + ' / ' + slides.length;
    try{ history.replaceState(null,'',location.pathname + location.search + '#' + (s+1) + (step ? '.'+step : '')); }catch(e){}
    updateNotes();
    document.dispatchEvent(new CustomEvent('deck:render', {detail:{slide:s, step}}));
  }
}

/* ---------- כוריאוגרפיה: עמעום מה שכבר נקרא (dim-past), והחלפה באותו מקום (.stack) ---------- */
function choreo(sl, gs, k){
  if (sl.classList.contains('dim-past'))
    gs.forEach((g,i)=>g.forEach(el=>el.classList.toggle('past', i < k-1 && !el.classList.contains('keep'))));
  sl.querySelectorAll('.stack').forEach(st=>{
    const items = [...st.children];
    const shown = items.filter(c=>!c.classList.contains('b') || c.classList.contains('in'));
    items.forEach(c=>c.classList.toggle('gone', shown.length > 0 && c !== shown[shown.length-1]));
  });
}

function next(){ if (step < groups(s).length) step++; else if (s < slides.length-1){ s++; step = 0; } render(); }
function prev(){ if (step > 0) step--; else if (s > 0){ s--; step = groups(s).length; } render(); }
function goTo(i, full){ s = Math.max(0, Math.min(slides.length-1, i)); step = full ? groups(s).length : 0; render(); }
function refresh(keep){
  slides = [...stage.querySelectorAll(':scope > .slide')];
  if (typeof keep === 'number') s = keep;
  s = Math.max(0, Math.min(slides.length-1, s)); step = Math.min(step, groups(s).length);
  const g = document.getElementById('grid'); if (g){ delete g.dataset.built; g.querySelector('.wrap').innerHTML = ''; }
  renderQR(); render();
}

/* ---------- התאמה למסך ---------- */
function fit(){
  if (PRINT) return;
  const d = document.getElementById('deck');
  const k = EXPORT ? 1 : Math.min((d.clientWidth||innerWidth)/1920, (d.clientHeight||innerHeight)/1080);
  stage.style.transform = 'scale(' + k + ')';
  root.style.setProperty('--zoom', k);
}

/* ---------- הודעה קצרה ---------- */
let toastT;
function toast(msg, ms){
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove('show'), ms||4200);
}

/* ---------- מסך מלא ---------- */
function fullscreen(){
  try{ (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(()=>toast('הדפדפן לא מאפשר מסך מלא כאן. נסו את המקש F')); }
  catch(e){ toast('הדפדפן לא מאפשר מסך מלא כאן'); }
}

/* ---------- כל השקפים ---------- */
function buildGrid(){
  const g = document.getElementById('grid'); if (!g || g.dataset.built) return;
  g.dataset.built = '1';
  const wrap = g.querySelector('.wrap');
  slides.forEach((sl,i)=>{
    const b = document.createElement('div'); b.className = 'th'; b.dataset.i = i; b.tabIndex = 0;
    const box = document.createElement('div'); box.className = 'box';
    const mini = document.createElement('div'); mini.className = 'mini';
    const clone = sl.cloneNode(true);
    clone.querySelectorAll('video').forEach(v=>{ v.removeAttribute('data-autoplay'); v.preload = 'metadata'; });
    clone.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
    clone.classList.add('active');
    for (let n=1; n<=groups(i).length; n++) clone.classList.add('at'+n);
    clone.querySelectorAll('.b').forEach(e=>e.classList.add('in'));
    clone.querySelectorAll('[data-count]').forEach(e=>{ e.textContent = e.dataset.count; });
    clone.querySelectorAll('.sel,[contenteditable]').forEach(e=>{ e.classList.remove('sel'); e.removeAttribute('contenteditable'); });
    mini.appendChild(clone); box.appendChild(mini);
    const cap = document.createElement('span'); cap.className = 'cap'; cap.textContent = (i+1) + '. ' + (sl.dataset.title || '');
    b.append(box, cap);
    b.addEventListener('click', ()=>{ if (b.dataset.dragged) return; closeGrid(); goTo(i, false); });
    wrap.appendChild(b);
  });
  document.dispatchEvent(new CustomEvent('deck:grid'));
}
function scaleThumbs(){ document.querySelectorAll('#grid .box').forEach(box=>{ box.firstChild.style.transform = 'scale(' + (box.clientWidth/1920) + ')'; }); }
function openGrid(){
  buildGrid(); const g = document.getElementById('grid'); g.classList.add('show');
  g.querySelectorAll('.th').forEach((t,i)=>t.classList.toggle('cur', i===s)); scaleThumbs();
  const cur = g.querySelector('.th.cur'); if (cur) cur.scrollIntoView({block:'center'});
}
function closeGrid(){ const g = document.getElementById('grid'); if (g) g.classList.remove('show'); }

/* ---------- חלון הערות דובר: חלון נפרד, כדי שלא יופיע בשיתוף מסך ---------- */
let notesWin = null, notesT0 = 0;
const NOTES_HTML = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>הערות דובר</title><style>
*{box-sizing:border-box}body{margin:0;font:18px/1.55 system-ui,-apple-system,"Arial Hebrew",sans-serif;background:#16151b;color:#f2f0f5}
.warn{background:#d92d20;color:#fff;font-weight:800;padding:12px 18px;font-size:16px;line-height:1.4}
.wrap{padding:20px 22px;display:flex;flex-direction:column;gap:16px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#b9b5c4;font-size:15px}
#timer{font-variant-numeric:tabular-nums;font-size:24px;font-weight:800;color:#fff;cursor:pointer}
h1{font-size:22px;margin:0}#notes{font-size:24px;line-height:1.6;white-space:pre-wrap;min-height:120px}
#notes.empty{color:#7d7888;font-size:18px}.next{color:#b9b5c4;font-size:16px;border-top:1px solid #2c2a34;padding-top:12px}
.btns{display:flex;gap:10px}.btns button{flex:1;font:inherit;font-weight:700;padding:12px;border-radius:12px;border:0;background:#2c2a34;color:#fff;cursor:pointer}
.btns button:hover{background:#3a3744}</style></head><body>
<div class="warn">בזום שתפו רק את חלון המצגת, לא את כל המסך. אחרת הקהל יראה את ההערות.</div>
<div class="wrap"><div class="top"><span id="pos"></span><span id="timer" title="לחיצה מאפסת">00:00</span></div>
<h1 id="ttl"></h1><div id="notes"></div><div class="next" id="nxt"></div>
<div class="btns"><button id="bp">הקודם</button><button id="bn">הבא</button></div></div></body></html>`;

function openNotes(){
  if (notesWin && !notesWin.closed){ notesWin.focus(); return; }
  notesWin = window.open('', 'deck-notes', 'width=560,height=720');
  if (!notesWin){ toast('הדפדפן חסם את חלון ההערות. אפשרו חלונות קופצים לקובץ הזה ונסו שוב.'); return; }
  notesWin.document.open(); notesWin.document.write(NOTES_HTML); notesWin.document.close();
  notesT0 = Date.now();
  const d = notesWin.document;
  d.getElementById('bn').onclick = ()=>next();
  d.getElementById('bp').onclick = ()=>prev();
  d.getElementById('timer').onclick = ()=>{ notesT0 = Date.now(); };
  d.addEventListener('keydown', onKey);
  updateNotes();
}
function updateNotes(){
  if (!notesWin || notesWin.closed) return;
  const d = notesWin.document, sl = slides[s], nx = slides[s+1];
  const n = (sl.querySelector('.notes')||{}).textContent || '';
  d.getElementById('pos').textContent = 'שקף ' + (s+1) + ' מתוך ' + slides.length;
  d.getElementById('ttl').textContent = sl.dataset.title || '';
  const ne = d.getElementById('notes'); ne.textContent = n.trim() || 'אין הערות לשקף הזה'; ne.classList.toggle('empty', !n.trim());
  d.getElementById('nxt').textContent = nx ? 'הבא: ' + (nx.dataset.title || '') : 'זה השקף האחרון';
}
setInterval(()=>{
  if (!notesWin || notesWin.closed) return;
  const sec = Math.floor((Date.now()-notesT0)/1000), t = notesWin.document.getElementById('timer');
  if (t) t.textContent = String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0');
}, 1000);

/* ---------- סרגל כפתורים: מופיע כשמזיזים את העכבר לתחתית ---------- */
const act = {prev, next, grid: openGrid, full: fullscreen, notes: openNotes};
function setupBar(){
  const bar = document.getElementById('bar'); if (!bar) return;
  let hideT;
  const show = ()=>{ bar.classList.add('show'); clearTimeout(hideT); hideT = setTimeout(()=>{ if (!bar.matches(':hover')) bar.classList.remove('show'); }, 2600); };
  addEventListener('mousemove', e=>{ if (e.clientY > innerHeight - 140) show(); });
  bar.addEventListener('mouseleave', ()=>{ hideT = setTimeout(()=>bar.classList.remove('show'), 1200); });
  bar.addEventListener('click', e=>e.stopPropagation());
  bar.querySelectorAll('[data-act]').forEach(b=>b.onclick = ()=>{ (act[b.dataset.act]||(()=>{}))(); });
  document.getElementById('grid').addEventListener('click', e=>{ if (e.target.id === 'grid') closeGrid(); });
  addEventListener('resize', ()=>{ if (document.getElementById('grid').classList.contains('show')) scaleThumbs(); });
  if (DEV) show();
}

function onKey(e){
  if (e.target && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
  const gridOpen = document.getElementById('grid') && document.getElementById('grid').classList.contains('show');
  if (e.key === 'Escape'){ closeGrid(); return; }
  if (gridOpen) return;
  if (e.metaKey || e.ctrlKey) return;
  if ([' ','Enter','ArrowRight','ArrowDown','PageDown'].includes(e.key)){ e.preventDefault(); next(); }
  else if (['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(e.key)){ e.preventDefault(); prev(); }
  else if (/^[fFכ]$/.test(e.key)) fullscreen();
  else if (/^[nNמ]$/.test(e.key)) openNotes();
  else if (/^[gGע]$/.test(e.key)) openGrid();
  else if (e.key === 'Home') goTo(0);
  else if (e.key === 'End') goTo(slides.length-1, true);
}

/* ---------- QR: נוצר מקומית, בלי אינטרנט ---------- */
function renderQR(){
  if (typeof qrcode !== 'function') return;
  document.querySelectorAll('#stage [data-qr]').forEach(el=>{
    try{ const q = qrcode(0,'M'); q.addData(el.dataset.qr); q.make(); el.innerHTML = q.createSvgTag({cellSize:8, margin:0, scalable:true}); }catch(e){}
  });
}

/* ---------- מידע לייצוא ולבדיקה ---------- */
function exportInfo(){
  const S = stage.getBoundingClientRect();
  const visible = el => !el.closest('.b') || el.closest('.b').classList.contains('in');
  const rect = el => { const r = el.getBoundingClientRect(); return {x:r.left-S.left, y:r.top-S.top, w:r.width, h:r.height}; };
  return {
    title: TITLE,
    slides: slides.map((el,i)=>({ steps: groups(i).length, title: el.dataset.title||'', notes: (el.querySelector('.notes')||{}).textContent||'' })),
    current: { slide: s, step,
      videos: [...slides[s].querySelectorAll('video')].filter(visible).map(v=>Object.assign({src:v.getAttribute('src')}, rect(v))),
      links: [...slides[s].querySelectorAll('a[href]')].filter(visible).map(a=>Object.assign({href:a.href}, rect(a))) }
  };
}
/* בדיקה: טקסט שיוצא מהשקף, טקסט חתוך, תמונה שלא נטענה */
function checkInfo(){
  const issues = [];
  slides.forEach((sl,i)=>{
    const R = sl.getBoundingClientRect();
    sl.querySelectorAll('*').forEach(el=>{
      if (el.closest('svg,.notes,.credit,.kbw,.half,.full,.frame,[data-bleed]') && !el.matches('.frame')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const own = [...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim());
      if (!own && !el.matches('img,video,.frame,.gcard,.chat,.paper,.dict')) return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const text = (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,50);
      if (r.left < R.left-2 || r.right > R.right+2 || r.top < R.top-2 || r.bottom > R.bottom+2)
        issues.push({slide:i+1, kind:'יוצא מהשקף', text});
      else if (own && (r.bottom > R.bottom-24 || r.top < R.top+20))
        issues.push({slide:i+1, kind:'צמוד מדי לקצה', text});
      if (own && el.scrollWidth > el.clientWidth + 4 && cs.overflow !== 'visible') issues.push({slide:i+1, kind:'טקסט חתוך לרוחב', text});
      if (own && el.scrollHeight > el.clientHeight + 4 && cs.overflow !== 'visible') issues.push({slide:i+1, kind:'טקסט חתוך', text});
    });
    sl.querySelectorAll('img').forEach(im=>{ if (!im.complete || !im.naturalWidth) issues.push({slide:i+1, kind:'תמונה לא נטענה', text:(im.getAttribute('src')||'').slice(0,80)}); });
  });
  document.fonts && document.fonts.forEach && document.fonts.forEach(f=>{ if (f.status === 'error') issues.push({slide:0, kind:'פונט לא נטען', text:f.family}); });
  return {issues};
}
function writeJSON(id, obj){
  const tag = document.createElement('script'); tag.type = 'application/json'; tag.id = id; tag.textContent = JSON.stringify(obj);
  document.body.appendChild(tag);
}

/* ---------- רענון חי: כש-Claude משנה את המצגת, הדפדפן מתעדכן ונשאר באותו שקף ---------- */
let version = null;
/* בזמן בנייה: כשנוסף שקף והצופה עמד על השקף האחרון, עוברים לשקף החדש. ותג "נבנה: X מתוך Y" */
function follow(){
  if (!DEV) return;
  let prev = 0; try{ prev = +sessionStorage.getItem('deck-count') || 0; }catch(e){}
  const wasLast = (()=>{ try{ return sessionStorage.getItem('deck-last') === '1'; }catch(e){ return false; } })();
  if (prev && slides.length > prev && wasLast){ s = slides.length - 1; step = groups(s).length; }
  try{ sessionStorage.setItem('deck-count', slides.length); }catch(e){}
  document.addEventListener('deck:render', ()=>{ try{ sessionStorage.setItem('deck-last', s === slides.length-1 ? '1' : '0'); }catch(e){} });
  const total = +(window.DECK_TOTAL || 0);
  if (total && slides.length < total){
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:150;background:#1d1c25;color:#fff;font:700 15px system-ui,sans-serif;padding:9px 18px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.4);direction:rtl';
    b.textContent = 'המצגת נבנית: ' + slides.length + ' מתוך ' + total + ' שקפים';
    document.body.appendChild(b);
  }
}
function liveReload(){
  if (!DEV) return;
  setInterval(async ()=>{
    try{
      const r = await fetch('/api/version', {cache:'no-store'}); const v = (await r.json()).v;
      if (version && v !== version && !(window.deckEdit && window.deckEdit.busy())) location.reload();
      version = v;
    }catch(e){}
  }, 1500);
}

/* ---------- הפעלה ---------- */
renderQR();
fit(); addEventListener('resize', fit);
const ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
const m = location.hash.match(/^#(\d+)(?:\.(\d+))?/);
if (m){ s = Math.min(slides.length, Math.max(1, +m[1])) - 1; step = Math.min(groups(s).length, +(m[2]||0)); }
follow();

if (EXPORT || PRINT || CHECK){
  render();
  const imgs = [...document.images].map(im=>im.complete ? 0 : new Promise(r=>{ im.onload = im.onerror = r; }));
  Promise.all([ready, ...imgs]).then(()=>{
    if (EXPORT) writeJSON('export-info', exportInfo());
    if (CHECK) writeJSON('check-info', checkInfo());
  });
} else {
  render();
  setupBar();
  liveReload();
  addEventListener('keydown', onKey);
  addEventListener('click', e=>{
    if (root.classList.contains('editing')) return;
    if (!e.target.closest('video[controls],a,button,#bar,#grid,#edit-ui,[contenteditable="true"],.no-advance')) next();
  });
}
window.deck = {next, prev, goTo, openNotes, openGrid, closeGrid, toast, refresh, render, groups, fit,
  get slides(){ return slides; }, get index(){ return s; }, get step(){ return step; }, set version(v){ version = v; }, act};
})();
