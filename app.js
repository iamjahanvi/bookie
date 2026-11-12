/* Bookie — a bookshelf for what you read and the lines you keep. */

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const today = () => new Date().toISOString().slice(0, 10);
const clone = o => JSON.parse(JSON.stringify(o));
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
const PALETTE = ['#8c2f39', '#2f4858', '#c9a227', '#3c6e47', '#d97b4a', '#4a3f6b', '#1f3b4d', '#b5654a', '#6d7f4b', '#e6d3ad', '#23211f', '#9b4f73'];
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255] }
function lum(hex) { if (!validHex(hex)) return .5; const c = rgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2] }
const validHex = h => /^#[0-9a-f]{6}$/i.test(h || '');
const textOn = bg => lum(bg) > .32 ? '#1d1a16' : '#f6f0e4';
function colorsOf(b) { const h = hash(b.id); const bg = validHex(b.color) ? b.color : PALETTE[h % PALETTE.length]; const acc = validHex(b.accent) ? b.accent : (lum(bg) > .32 ? '#7a2b22' : '#e2c27a'); return { bg, acc, fg: textOn(bg) } }
const surname = a => (a || '').split(/,|&| and /)[0].trim().split(/\s+/).pop() || '';
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const STATUS = { want: 'Want to read', reading: 'Reading', finished: 'Finished' };
const proxied = url => 'api/cover?u=' + encodeURIComponent(url);
const olCover = (id, size = 'L') => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800) }
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M15 5l-7 7 7 7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>'
};
const pref = { get(k, d) { try { return localStorage.getItem('bookie:' + k) ?? d } catch { return d } }, set(k, v) { try { localStorage.setItem('bookie:' + k, v) } catch { } } };

/* ---------- images ---------- */
function loadImg(src, cors = false) {
  return new Promise((res, rej) => { const i = new Image(); if (cors) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src });
}
async function compress(file, max = 1600, q = .86) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  } finally { URL.revokeObjectURL(url) }
}
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b) });
/* Pull a spine colour + accent out of a cover image. */
async function coverPalette(src) {
  const img = src.startsWith('blob:') || src.startsWith('data:') ? await loadImg(src, true) : await loadImg(proxied(src), true).catch(() => loadImg(src, true));
  const c = document.createElement('canvas'); const w = c.width = 40, h = c.height = 60;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data; const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
    const b = buckets.get(k) || [0, 0, 0, 0]; b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++; buckets.set(k, b);
  }
  const cols = [...buckets.values()].sort((a, b) => b[3] - a[3]).map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3]].map(Math.round));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const out = []; for (const c of cols) { if (out.every(o => dist(o, c) > 48)) out.push(c); if (out.length >= 6) break }
  return out.map(c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''));
}
function pickAccent(bg, pal) { const b = rgb(bg); const far = pal.find(c => Math.hypot(...rgb(c).map((v, i) => v - b[i])) > 110); return far || (lum(bg) > .32 ? '#7a2b22' : '#e2c27a') }

/* ---------- state ---------- */
const S = { books: new Map(), mode: 'loading', sb: null, user: null, cfg: null, openId: null, lineIdx: null, note: '', view: pref.get('view', 'spines') };
const CACHE = () => 'bookie:cache:' + (S.user?.id || 'local');
function saveCache() { try { localStorage.setItem(CACHE(), JSON.stringify([...S.books.values()])) } catch { } }
function loadCache() { try { JSON.parse(localStorage.getItem(CACHE()) || '[]').forEach(b => S.books.set(b.id, b)) } catch { } }

/* ---------- sync ---------- */
const pend = {}, running = {};
function queueWrite(id) {
  saveCache(); if (S.mode !== 'cloud') return;
  pend[id] = true; if (running[id]) return; running[id] = true;
  (async () => {
    while (pend[id]) {
      pend[id] = false; const b = S.books.get(id);
      const { error } = b
        ? await S.sb.from('books').upsert({ id, data: b, updated_at: new Date(b.updatedAt || Date.now()).toISOString() })
        : await S.sb.from('books').delete().eq('id', id);
      if (error) { toast('Couldn’t save — will retry when you’re back online.'); pend[id] = true; await new Promise(r => setTimeout(r, 8000)) }
    }
    running[id] = false;
  })();
}
function saveBook(b) { b.updatedAt = Date.now(); S.books.set(b.id, b); queueWrite(b.id); refresh() }
function deleteBook(id) { S.books.delete(id); queueWrite(id); refresh() }
async function pull() {
  const { data, error } = await S.sb.from('books').select('id,data');
  if (error) { S.note = 'Showing your saved copy — couldn’t reach your shelf.'; refresh(); return }
  const m = new Map(); data.forEach(r => m.set(r.id, r.data));
  for (const id of Object.keys(pend)) if (pend[id] || running[id]) { const b = S.books.get(id); b ? m.set(id, b) : m.delete(id) }
  S.books = m; S.note = ''; saveCache(); refresh();
}
function subscribe() {
  S.sb.channel('books').on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, p => {
    if (running[p.new?.id || p.old?.id]) return;
    if (p.eventType === 'DELETE') S.books.delete(p.old.id); else S.books.set(p.new.id, p.new.data);
    saveCache(); refresh();
  }).subscribe();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull() });
}
async function uploadImage(blob) {
  if (S.mode !== 'cloud') return await blobToDataURL(blob); // demo mode keeps it inline
  const path = `${S.user.id}/${rid()}.jpg`;
  const { error } = await S.sb.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return S.sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/* ---------- home ---------- */
function allLines() { const out = []; for (const b of S.books.values()) (b.quotes || []).forEach(q => out.push({ b, q })); return out }
function spineHTML(b, extra = '', tag = 'button') {
  const h = hash(b.id), { bg, acc, fg } = colorsOf(b);
  const pages = b.pages || 220 + h % 260;
  const w = Math.max(30, Math.min(60, Math.round(pages / 10.5)));
  const ht = 166 + (h % 6) * 9 + (b.pages ? Math.min(20, b.pages / 60) : 0);
  const n = (b.quotes || []).length;
  return `<${tag} class="spine p${h % 4} ${extra}" data-id="${esc(b.id)}" style="--bg:${bg};--acc:${acc};--fg:${fg};width:${w}px;height:${Math.round(ht)}px" aria-label="${esc(b.title)}">
    <span class="t">${esc(b.title || 'Untitled')}</span><span class="a">${esc(surname(b.author))}</span>${n ? `<span class="q">${n}</span>` : ''}</${tag}>`;
}
function faceHTML(b) {
  const { bg, fg } = colorsOf(b); const n = (b.quotes || []).length;
  return `<button class="facecover" data-id="${esc(b.id)}" style="--bg:${bg};--fg:${fg}" aria-label="${esc(b.title)}">
    <span class="ft">${esc(b.title)}</span>${b.coverUrl ? `<img src="${esc(b.coverUrl)}" alt="" loading="lazy" onerror="this.remove()">` : ''}${n ? `<span class="fq">${n} line${n > 1 ? 's' : ''}</span>` : ''}</button>`;
}
function shelfHTML(key, books) {
  const ghost = '<div class="spine ghost" style="width:34px;height:170px"></div><div class="spine ghost" style="width:44px;height:190px"></div><div class="spine ghost" style="width:30px;height:160px"></div>';
  const msg = { reading: 'Nothing on the go. Pull something off the to-read shelf.', finished: 'Finished books gather here.', want: 'Books you’re eyeing go here.' }[key];
  const covers = S.view === 'covers';
  return `<section class="shelf"><div class="shelf-h"><h2>${key === 'reading' ? 'Reading now' : STATUS[key]}</h2><span class="n">${books.length ? String(books.length).padStart(2, '0') : ''}</span></div>
    <div class="case"><div class="rack ${covers ? 'covers' : ''}">${books.length ? books.map(b => covers ? faceHTML(b) : spineHTML(b)).join('') : ghost}</div><div class="plank"><i class="top"></i><i class="front"></i></div></div>
    ${books.length ? '' : `<p class="empty-note">${msg}</p>`}</section>`;
}
function statsHTML() {
  const yr = String(new Date().getFullYear()), books = [...S.books.values()];
  const fin = books.filter(b => b.status === 'finished' && (b.finished || '').startsWith(yr));
  const pages = fin.reduce((s, b) => s + (+b.pages || 0), 0);
  const lines = allLines().length;
  const nowReading = books.filter(b => (b.status || 'reading') === 'reading').length;
  const byMonth = Array.from({ length: 12 }, () => []); fin.forEach(b => { const m = +(b.finished || '').slice(5, 7) - 1; if (m >= 0) byMonth[m].push(b) });
  const most = books.slice().sort((a, b) => (b.quotes || []).length - (a.quotes || []).length)[0];
  return `<section class="stats"><h2>${yr}, in reading</h2>
    <div class="stat-grid">
      <div class="stat"><b>${fin.length}</b><span>finished</span></div>
      <div class="stat"><b>${pages >= 1000 ? (pages / 1000).toFixed(1) + 'k' : pages}</b><span>pages</span></div>
      <div class="stat"><b>${lines}</b><span>lines kept</span></div>
      <div class="stat"><b>${nowReading}</b><span>on the go</span></div>
    </div>
    <div class="months">${byMonth.map(arr => `<div class="mo">${arr.slice(0, 7).map(b => `<i style="background:${colorsOf(b).bg}" title="${esc(b.title)}"></i>`).join('')}</div>`).join('')}</div>
    <div class="mo-l">${MONTHS.map(m => `<span>${m}</span>`).join('')}</div>
    ${most && (most.quotes || []).length ? `<p class="fav">Most underlined: <i>${esc(most.title)}</i> — ${most.quotes.length} line${most.quotes.length > 1 ? 's' : ''}.</p>` : ''}
  </section>`;
}
function pullHTML() {
  const L = allLines(); if (!L.length) return '';
  if (S.lineIdx == null || S.lineIdx >= L.length) S.lineIdx = Math.floor(Math.random() * L.length);
  const { b, q } = L[S.lineIdx];
  return `<section class="pull"><div class="lbl"><span>From your margins</span>${L.length > 1 ? '<button class="linkbtn" id="another">Another</button>' : ''}</div>
    <blockquote data-open="${esc(b.id)}">${esc(q.text)}</blockquote><cite>— ${esc(b.title)}${b.author ? ', ' + esc(b.author) : ''}${q.page ? ' · p. ' + esc(q.page) : ''}</cite></section>`;
}
let shelf3d = null, shelf3dState = 'idle';
function coverSources(url) {
  if (url.startsWith('data:')) return [url];
  return S.cfg?.supabaseUrl ? [proxied(url), url] : [url, proxied(url)];
}
async function init3d() {
  shelf3dState = 'loading';
  try {
    const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) throw new Error('no webgl2');
    const m = await import('./shelf3d.js');
    shelf3d = await m.createShelf3D($('#bc'), { colorsOf, coverSrc: coverSources, onPick: id => openDetail(id) });
    shelf3dState = 'ready'; $('#bc').classList.add('ready');
  } catch (e) { console.warn('3D bookcase unavailable, using flat shelves', e); shelf3dState = 'failed' }
  refresh();
}
function renderHome() {
  const app = $('#app');
  if (S.mode === 'loading') { app.innerHTML = '<div class="loading">Dusting the shelves…</div>'; return }
  if (S.mode === 'gate') return;
  if (shelf3d && !document.body.contains(shelf3d.el)) { shelf3d.destroy(); shelf3d = null; shelf3dState = 'idle' }
  const books = [...S.books.values()];
  if (!$('#home')) {
    app.innerHTML = `<div id="home">
      <header class="topbar"><h1 class="wm">Book<em>ie</em></h1><div class="seg mini" id="vt">${[['spines', 'Spines'], ['covers', 'Covers']].map(([k, l]) => `<button data-view="${k}">${l}</button>`).join('')}</div></header>
      <div class="bookcase3d" id="bc"><div class="bc-hint" id="bc-hint"></div></div>
      <div id="below"></div></div>`;
    $$('[data-view]', app).forEach(b => b.onclick = () => { S.view = b.dataset.view; pref.set('view', S.view); refresh() });
    if (shelf3dState === 'idle') init3d();
  }
  $$('#vt button').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  $('#vt').style.visibility = books.length ? 'visible' : 'hidden';
  const bc = $('#bc');
  if (shelf3d) shelf3d.update(books, S.view);
  else if (shelf3dState === 'failed') {
    const by = k => books.filter(b => (b.status || 'reading') === k);
    bc.classList.add('flat');
    bc.innerHTML = shelfHTML('reading', by('reading')) + shelfHTML('finished', by('finished').sort((a, b) => (b.finished || '').localeCompare(a.finished || ''))) + shelfHTML('want', by('want'));
    $$('[data-id]', bc).forEach(s => s.onclick = () => { s.classList.add('pulled'); setTimeout(() => { openDetail(s.dataset.id); s.classList.remove('pulled') }, 200) });
  }
  const hint = $('#bc-hint'); if (hint) hint.textContent = books.length ? '' : 'Your shelves are empty. Add your first book.';
  const below = $('#below');
  below.innerHTML = `${S.note ? `<div class="banner">${esc(S.note)}</div>` : ''}${pullHTML()}${books.length ? statsHTML() : ''}
    ${S.mode === 'cloud' ? '<button class="signout" id="signout">Sign out</button>' : ''}`;
  const an = $('#another'); if (an) an.onclick = () => { const n = allLines().length; let i; do { i = Math.floor(Math.random() * n) } while (n > 1 && i === S.lineIdx); S.lineIdx = i; renderHome() };
  const bq = $('.pull blockquote'); if (bq) bq.onclick = () => openDetail(bq.dataset.open);
  const so = $('#signout'); if (so) so.onclick = () => confirmSheet('Sign out?', 'Your shelf stays safe in your account.', 'Sign out', async () => { await S.sb.auth.signOut(); try { localStorage.removeItem(CACHE()) } catch { } location.reload() });
  $('#fab').hidden = false;
}

/* ---------- detail ---------- */
function coverHTML(b, cls = 'cover') {
  const { bg, acc, fg } = colorsOf(b);
  return `<div class="${cls}" style="--bg:${bg};--acc:${acc};--fg:${fg}">
    <div><div class="ct">${esc(b.title || 'Untitled')}</div><div class="cr"></div></div><div class="ca">${esc(b.author || '')}</div>
    ${b.coverUrl ? `<img src="${esc(b.coverUrl)}" alt="" onerror="this.remove()">` : ''}</div>`;
}
function openDetail(id) { S.openId = id; renderDetail(); const d = $('#detail'); d.scrollTop = 0; d.setAttribute('aria-hidden', 'false'); requestAnimationFrame(() => d.classList.add('open')); clearTimeout(openDetail._p); openDetail._p = setTimeout(() => S.openId && shelf3d?.pause(true), 450) }
function closeDetail() { clearTimeout(openDetail._p); shelf3d?.pause(false); shelf3d?.pushBack(); const d = $('#detail'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); S.openId = null; setTimeout(() => { if (!S.openId) d.innerHTML = '' }, 400) }
function renderDetail() {
  const b = S.books.get(S.openId), d = $('#detail');
  if (!b) { if (S.openId) closeDetail(); return }
  const { bg } = colorsOf(b);
  const facts = [b.year, b.pages ? b.pages + ' pp.' : '', b.genre].filter(Boolean).join(' · ');
  const quotes = (b.quotes || []).slice().sort((x, y) => (+x.page || 1e9) - (+y.page || 1e9) || (x.createdAt - y.createdAt));
  const st = b.status || 'reading';
  d.innerHTML = `<div class="dbar"><button class="iconbtn" id="d-back" aria-label="Back">${ICON.back}</button><button class="iconbtn" id="d-edit" aria-label="Edit book">${ICON.edit}</button></div>
  <div class="dwrap">
    <div class="hero">${coverHTML(b)}<div><h1>${esc(b.title)}</h1>${b.author ? `<div class="by">by ${esc(b.author)}</div>` : ''}${facts ? `<div class="facts">${esc(facts)}</div>` : ''}</div></div>
    ${b.blurb ? `<p class="blurb">${esc(b.blurb)}</p>` : ''}
    <div class="panel">
      <div class="full"><span class="lab">Status</span><div class="seg">${['want', 'reading', 'finished'].map(k => `<button data-st="${k}" class="${st === k ? 'on' : ''}">${STATUS[k]}</button>`).join('')}</div></div>
      <div class="full" style="border-bottom:0"><span class="lab">Finished reading on</span><input type="date" class="dinput" id="d-fin" value="${esc(b.finished || '')}"></div>
    </div>
    <div class="lines-h"><h2>Lines</h2><button class="btn primary" id="d-add">${ICON.plus} Add a line</button></div>
    <div id="slips">${quotes.length ? quotes.map(q => `<div class="slip" style="--bk:${bg}" data-q="${esc(q.id)}">
      ${q.photo ? `<img class="ph" src="${esc(q.photo)}" alt="" onerror="this.remove()">` : ''}
      <p>${esc(q.text)}</p>${q.note ? `<div class="note">${esc(q.note)}</div>` : ''}
      <div class="foot"><span class="pg">${q.page ? 'p. ' + esc(q.page) : '&nbsp;'}</span><span class="acts"><button data-a="share">Card</button><button data-a="edit">Edit</button></span></div></div>`).join('')
      : `<div class="nolines">No lines yet. When a sentence stops you, keep it here.</div>`}</div>
    <div class="danger"><button id="d-del">Remove this book</button></div>
  </div>`;
  $('#d-back').onclick = closeDetail;
  $('#d-edit').onclick = () => bookSheet(b);
  $('#d-add').onclick = () => quoteSheet(b);
  $$('.seg button', d).forEach(x => x.onclick = () => { const nb = clone(b); nb.status = x.dataset.st; if (nb.status === 'finished' && !nb.finished) nb.finished = today(); saveBook(nb); if (nb.status === 'finished' && b.status !== 'finished') toast('Another one for the finished shelf.') });
  $('#d-fin').onchange = e => { const nb = clone(b); nb.finished = e.target.value || null; if (nb.finished) nb.status = 'finished'; saveBook(nb) };
  $$('.slip', d).forEach(s => {
    const q = (b.quotes || []).find(q => q.id === s.dataset.q);
    s.querySelector('[data-a=share]').onclick = () => shareSheet(b, q);
    s.querySelector('[data-a=edit]').onclick = () => quoteSheet(b, q);
  });
  $('#d-del').onclick = () => confirmSheet(`Remove “${b.title}”?`, `Its ${(b.quotes || []).length} saved line${(b.quotes || []).length === 1 ? '' : 's'} go with it.`, 'Remove', () => { deleteBook(b.id); closeDetail() });
}
function refresh() {
  renderHome();
  if (S.openId) { const ae = document.activeElement; if (!(ae && $('#detail').contains(ae) && /INPUT|TEXTAREA/.test(ae.tagName))) { const top = $('#detail').scrollTop; renderDetail(); $('#detail').scrollTop = top } }
}

/* ---------- sheets ---------- */
function openSheet(build) {
  const w = document.createElement('div'); w.className = 'sheet-wrap';
  w.innerHTML = '<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sb"></div></div>';
  document.body.append(w); requestAnimationFrame(() => requestAnimationFrame(() => w.classList.add('open')));
  let closed = false; const close = () => { if (closed) return; closed = true; w.classList.remove('open'); setTimeout(() => w.remove(), 300); close.onclose && close.onclose() };
  w.querySelector('.scrim').onclick = close; build($('.sb', w), close); return close;
}
function confirmSheet(title, sub, label, fn) {
  openSheet((body, close) => {
    body.innerHTML = `<h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p><div class="actions"><button class="btn ghost" id="c-no">Never mind</button><button class="btn primary" id="c-yes">${esc(label)}</button></div>`;
    $('#c-no', body).onclick = close; $('#c-yes', body).onclick = () => { close(); fn() };
  });
}

/* Open Library search (falls back to Google Books) */
async function searchBooks(q, signal) {
  const out = [];
  try {
    const r = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i,subject`, { signal });
    const j = await r.json();
    for (const d of j.docs || []) out.push({ src: 'ol', key: d.key, title: d.title, author: (d.author_name || []).slice(0, 2).join(' & '), year: d.first_publish_year || null, pages: d.number_of_pages_median || null, genre: (d.subject || [])[0] || '', coverId: d.cover_i || null, cover: d.cover_i ? olCover(d.cover_i, 'M') : null, coverL: d.cover_i ? olCover(d.cover_i, 'L') : null });
  } catch (e) { if (e.name === 'AbortError') throw e }
  if (out.filter(x => x.cover).length < 2) {
    try {
      const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books`, { signal });
      const j = await r.json();
      for (const it of j.items || []) {
        const v = it.volumeInfo || {}; let t = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null;
        if (t) t = t.replace('http://', 'https://').replace('&edge=curl', '');
        out.push({ src: 'gb', key: it.id, title: v.title + (v.subtitle ? ': ' + v.subtitle : ''), author: (v.authors || []).slice(0, 2).join(' & '), year: parseInt(v.publishedDate) || null, pages: v.pageCount || null, genre: (v.categories || [])[0] || '', cover: t, coverL: t ? t.replace(/zoom=\d/, 'zoom=1') + '&fife=w600' : null, blurb: v.description || '' });
      }
    } catch (e) { if (e.name === 'AbortError') throw e }
  }
  // books with covers first
  return out.sort((a, b) => (!!b.cover) - (!!a.cover)).slice(0, 14);
}
async function editionCovers(workKey, signal) {
  const r = await fetch(`https://openlibrary.org${workKey}/editions.json?limit=60`, { signal });
  const j = await r.json(); const ids = [];
  for (const e of j.entries || []) for (const c of (e.covers || [])) if (c > 0 && !ids.includes(c)) ids.push(c);
  return ids.slice(0, 18);
}
async function workBlurb(workKey, signal) {
  try {
    const j = await (await fetch(`https://openlibrary.org${workKey}.json`, { signal })).json();
    let d = typeof j.description === 'string' ? j.description : j.description?.value || '';
    d = d.replace(/\r?\n[\s\S]*/, '').replace(/\[.*?\]\(.*?\)/g, '').trim();
    const m = d.match(/^.{20,200}?[.!?](\s|$)/); return m ? m[0].trim() : (d.length <= 200 ? d : '');
  } catch { return '' }
}
const firstSentence = s => { const t = String(s || '').replace(/<[^>]+>/g, ''); const m = t.match(/^.{20,200}?[.!?](\s|$)/); return m ? m[0].trim() : '' };

function bookSheet(existing) {
  openSheet((body, close) => {
    const b = existing ? clone(existing) : { id: 'b-' + rid(), title: '', author: '', year: null, pages: null, genre: '', blurb: '', status: 'reading', finished: null, quotes: [], createdAt: Date.now() };
    let ctl = null, results = [], chosen = null, pal = [], ownCover = null;
    close.onclose = () => ctl?.abort();
    body.innerHTML = `<h2>${existing ? 'Edit book' : 'Add a book'}</h2>
      <label class="fld"><span>Find it</span><div class="row"><input class="inp" id="f-q" autocomplete="off" enterkeyhint="search" placeholder="Title, author or ISBN" value="${esc(existing ? '' : '')}"><button class="btn ghost" id="f-go" type="button">${ICON.search} Search</button></div></label>
      <p class="hint" id="f-hint">${existing ? 'Search to swap the cover or fix the details.' : 'Covers come from Open Library.'}</p>
      <div class="results" id="f-res" hidden></div>
      <div class="fld" id="f-covers-wrap"><span class="lab">Cover</span><div class="pick-row"><div id="f-prev"></div></div><div class="editions" id="f-eds"></div></div>
      <label class="fld"><span>Title</span><input class="inp" id="f-title" value="${esc(b.title)}"></label>
      <label class="fld"><span>Author</span><input class="inp" id="f-author" value="${esc(b.author)}"></label>
      <div class="grid3"><label class="fld"><span>Year</span><input class="inp" id="f-year" inputmode="numeric" value="${esc(b.year ?? '')}"></label>
        <label class="fld"><span>Pages</span><input class="inp" id="f-pages" inputmode="numeric" value="${esc(b.pages ?? '')}"></label>
        <label class="fld"><span>Genre</span><input class="inp" id="f-genre" value="${esc(b.genre)}"></label></div>
      ${existing ? '' : `<div class="fld"><span class="lab">Shelf</span><div class="seg" id="f-st">${['want', 'reading', 'finished'].map(k => `<button type="button" data-st="${k}" class="${b.status === k ? 'on' : ''}">${STATUS[k]}</button>`).join('')}</div></div>`}
      <div class="fld"><span class="lab">Spine colour</span><div class="swatches" id="f-sw"></div></div>
      <label class="fld"><span>A line about it (optional)</span><textarea class="inp" id="f-blurb" rows="2">${esc(b.blurb)}</textarea></label>
      <div class="actions"><button class="btn ghost" id="f-cancel" type="button">Cancel</button><button class="btn primary" id="f-save" type="button">${existing ? 'Save' : 'Shelve it'}</button></div>`;
    const read = () => { b.title = $('#f-title', body).value.trim(); b.author = $('#f-author', body).value.trim(); b.year = parseInt($('#f-year', body).value) || null; b.pages = parseInt($('#f-pages', body).value) || null; b.genre = $('#f-genre', body).value.trim(); b.blurb = $('#f-blurb', body).value.trim() };
    const setVal = (id, v, force) => { const el = $('#' + id, body); if (v != null && v !== '' && (force || !el.value.trim())) el.value = v };
    const drawPrev = () => {
      read(); const tmp = clone(b);
      $('#f-prev', body).innerHTML = `<div style="display:flex;gap:12px;align-items:flex-end">${coverHTML(tmp, 'cover mini-cover')}${spineHTML(tmp, 'mini-spine', 'div')}</div>`;
      const cur = colorsOf(b).bg; const list = [...new Set([...pal, ...PALETTE])];
      const sw = $('#f-sw', body);
      sw.innerHTML = list.map(c => `<button type="button" class="sw ${c.toLowerCase() === cur.toLowerCase() ? 'on' : ''} ${pal.includes(c) ? 'sug' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('');
      $$('.sw', sw).forEach(x => x.onclick = () => { b.color = x.dataset.c; b.accent = pal.length ? pickAccent(b.color, pal) : undefined; if (!b.accent) delete b.accent; drawPrev() });
    };
    const setCover = async (url, isOwn) => {
      b.coverUrl = url; drawPrev();
      try { pal = await coverPalette(url); if (pal[0]) { b.color = pal[0]; b.accent = pickAccent(pal[0], pal) } } catch { pal = [] }
      if (!isOwn) ownCover = null; drawPrev();
    };
    const drawEditions = (ids = []) => {
      const eds = $('#f-eds', body);
      eds.innerHTML = ids.map(id => `<button type="button" class="ed ${b.coverUrl === olCover(id) ? 'on' : ''}" data-cid="${id}"><img src="${olCover(id, 'M')}" alt="" loading="lazy" onerror="this.parentNode.remove()"></button>`).join('')
        + `<label class="ed up">Your<br>photo<input type="file" accept="image/*" id="f-own"></label>`;
      $$('.ed[data-cid]', eds).forEach(x => x.onclick = () => { $$('.ed', eds).forEach(y => y.classList.toggle('on', y === x)); setCover(olCover(+x.dataset.cid)) });
      $('#f-own', eds).onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        ownCover = await compress(f, 1000, .88); const u = URL.createObjectURL(ownCover);
        $$('.ed', eds).forEach(y => y.classList.remove('on')); setCover(u, true);
      };
    };
    drawPrev(); drawEditions();
    const choose = async r => {
      chosen = r; $$('.res', body).forEach(x => x.classList.toggle('on', x.dataset.k === r.key));
      setVal('f-title', r.title, true); setVal('f-author', r.author, true); setVal('f-year', r.year, true); setVal('f-pages', r.pages, true); setVal('f-genre', r.genre, true);
      if (r.coverL) setCover(r.coverL);
      ctl?.abort(); ctl = new AbortController();
      if (r.src === 'gb') { setVal('f-blurb', firstSentence(r.blurb)); drawEditions(); return }
      $('#f-hint', body).innerHTML = '<span class="spin"></span> Finding other editions…';
      try {
        const [ids, blurb] = await Promise.all([editionCovers(r.key, ctl.signal), workBlurb(r.key, ctl.signal)]);
        if (r.coverId && !ids.includes(r.coverId)) ids.unshift(r.coverId);
        drawEditions(ids); setVal('f-blurb', blurb);
        $('#f-hint', body).textContent = ids.length > 1 ? `${ids.length} covers — tap the edition you own.` : '';
      } catch (e) { if (e.name !== 'AbortError') $('#f-hint', body).textContent = '' }
    };
    const runSearch = async () => {
      const q = $('#f-q', body).value.trim(); if (!q) { $('#f-q', body).focus(); return }
      ctl?.abort(); ctl = new AbortController(); const hint = $('#f-hint', body); hint.innerHTML = '<span class="spin"></span> Searching…';
      try {
        results = await searchBooks(q, ctl.signal);
        const box = $('#f-res', body); box.hidden = !results.length;
        hint.textContent = results.length ? 'Tap the right one.' : 'Nothing found — fill it in by hand below.';
        box.innerHTML = results.map(r => `<button type="button" class="res" data-k="${esc(r.key)}"><div class="rc">${r.cover ? `<img src="${esc(r.cover)}" alt="" loading="lazy">` : `<span class="nc">${esc(r.title)}</span>`}</div><div class="rt">${esc(r.title)}</div><div class="ra">${esc(r.author)}${r.year ? ' · ' + r.year : ''}</div></button>`).join('');
        $$('.res', box).forEach(x => x.onclick = () => choose(results.find(r => r.key === x.dataset.k)));
      } catch (e) { if (e.name !== 'AbortError') hint.textContent = 'Search isn’t reachable right now — fill it in by hand.' }
    };
    $('#f-go', body).onclick = runSearch;
    $('#f-q', body).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } });
    ['f-title', 'f-author'].forEach(i => $('#' + i, body).addEventListener('input', () => { clearTimeout(drawPrev._t); drawPrev._t = setTimeout(drawPrev, 250) }));
    $$('#f-st button', body).forEach(x => x.onclick = () => { b.status = x.dataset.st; $$('#f-st button', body).forEach(y => y.classList.toggle('on', y === x)) });
    $('#f-cancel', body).onclick = close;
    $('#f-save', body).onclick = async () => {
      read(); if (!b.title) { toast('A book needs a title — search, or type one.'); $('#f-title', body).focus(); return }
      const btn = $('#f-save', body); btn.disabled = true;
      if (ownCover) { btn.innerHTML = '<span class="spin"></span> Uploading'; try { b.coverUrl = await uploadImage(ownCover) } catch { toast('Cover photo didn’t upload — saved without it.'); delete b.coverUrl } }
      if (b.coverUrl && b.coverUrl.startsWith('blob:')) delete b.coverUrl;
      if (b.status === 'finished' && !b.finished) b.finished = today();
      if (!b.accent) delete b.accent;
      saveBook(b); close();
      if (!existing) { toast('Shelved.'); setTimeout(() => openDetail(b.id), 250) }
    };
    if (!existing) setTimeout(() => $('#f-q', body).focus(), 350);
  });
}

function quoteSheet(book, existing) {
  openSheet((body, close) => {
    const q = existing ? clone(existing) : { id: 'q-' + rid(), text: '', page: '', note: '', createdAt: Date.now() };
    let photo = null, sents = [], picked = new Set(), ctl = null;
    close.onclose = () => ctl?.abort();
    const canPhoto = S.cfg?.transcribe && S.mode === 'cloud';
    body.innerHTML = `<h2>${existing ? 'Edit line' : 'Keep a line'}</h2><p class="sub">from <i>${esc(book.title)}</i></p>
      ${canPhoto ? `<label class="btn ghost filebtn">${ICON.cam} From a photo of the page<input type="file" accept="image/*" id="q-photo"></label><div class="ocr" id="q-ocr"></div>` : ''}
      <label class="fld"><span>The line</span><textarea class="inp" id="q-text" rows="5" placeholder="Copy it out, word for word…">${esc(q.text)}</textarea></label>
      <div class="grid2"><label class="fld"><span>Page</span><input class="inp" id="q-page" inputmode="numeric" value="${esc(q.page)}"></label>
        <label class="fld"><span>Your note in the margin</span><input class="inp" id="q-note" value="${esc(q.note)}" placeholder="why it stopped you"></label></div>
      <div class="actions">${existing ? '<button class="btn ghost" id="q-del" type="button" style="margin-right:auto">Delete</button>' : ''}<button class="btn ghost" id="q-cancel" type="button">Cancel</button><button class="btn primary" id="q-save" type="button">Keep it</button></div>`;
    const ta = $('#q-text', body);
    const renderSents = () => {
      const box = $('#q-sents', body); if (!box) return;
      box.innerHTML = sents.map((s, i) => `<button type="button" class="sent ${picked.has(i) ? 'on' : ''}" data-i="${i}">${esc(s)}</button>`).join('');
      $$('.sent', box).forEach(x => x.onclick = () => { const i = +x.dataset.i; picked.has(i) ? picked.delete(i) : picked.add(i); ta.value = [...picked].sort((a, b) => a - b).map(i => sents[i]).join(' '); renderSents() });
    };
    const ph = $('#q-photo', body);
    if (ph) ph.onchange = async () => {
      const f = ph.files[0]; if (!f) return; ph.value = '';
      const ocr = $('#q-ocr', body); const url = URL.createObjectURL(f);
      ocr.innerHTML = `<div class="thumb"><img src="${url}" alt=""><span><span class="spin"></span> Reading the page…</span></div>`;
      ctl?.abort(); ctl = new AbortController();
      try {
        photo = await compress(f, 1600, .85);
        const { data: { session } } = await S.sb.auth.getSession();
        const r = await fetch('api/transcribe', {
          method: 'POST', signal: ctl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
          body: JSON.stringify({ image: await blobToDataURL(photo), title: book.title, author: book.author })
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'failed');
        sents = (j.sentences || []).map(String).filter(s => s.trim());
        if (!sents.length) throw new Error('No text found on that page.');
        picked = new Set((j.marked || []).map(Number).filter(i => i >= 0 && i < sents.length));
        if (j.page && !$('#q-page', body).value) $('#q-page', body).value = String(j.page).replace(/\D/g, '');
        ocr.innerHTML = `<div class="thumb"><img src="${url}" alt=""><span>${picked.size ? 'Your marked lines are picked — ' : ''}Tap the sentences to keep.</span></div>
          <div class="sents" id="q-sents"></div><label class="check"><input type="checkbox" id="q-keep" checked> Keep the photo with this line</label>`;
        renderSents(); if (picked.size) ta.value = [...picked].sort((a, b) => a - b).map(i => sents[i]).join(' ');
      } catch (e) {
        if (e.name === 'AbortError') return; photo = null;
        ocr.innerHTML = `<div class="thumb"><img src="${url}" alt=""><span>${esc(e.message === 'failed' ? 'Couldn’t read that page — try a sharper photo.' : e.message)}</span></div>`;
      }
    };
    $('#q-cancel', body).onclick = close;
    const del = $('#q-del', body); if (del) del.onclick = () => { const nb = clone(S.books.get(book.id)); nb.quotes = (nb.quotes || []).filter(x => x.id !== q.id); saveBook(nb); close(); toast('Line removed.') };
    $('#q-save', body).onclick = async () => {
      q.text = ta.value.trim(); q.page = $('#q-page', body).value.trim(); q.note = $('#q-note', body).value.trim();
      if (!q.text) { toast('Nothing to keep yet.'); ta.focus(); return }
      const btn = $('#q-save', body); btn.disabled = true;
      const keep = $('#q-keep', body);
      if (photo && keep?.checked) { btn.innerHTML = '<span class="spin"></span> Saving'; try { q.photo = await uploadImage(photo) } catch { } }
      const nb = clone(S.books.get(book.id) || book); nb.quotes = nb.quotes || [];
      const i = nb.quotes.findIndex(x => x.id === q.id); if (i >= 0) nb.quotes[i] = q; else nb.quotes.push(q);
      saveBook(nb); close(); if (!existing) { S.lineIdx = null; toast('Kept.') }
    };
    if (!existing && !canPhoto) setTimeout(() => ta.focus(), 350);
  });
}

/* ---------- share card ---------- */
async function drawCard(canvas, b, q, style) {
  const W = 1080, H = 1350; canvas.width = W; canvas.height = H; const x = canvas.getContext('2d');
  try { await Promise.all(['400 60px Fraunces', 'italic 400 60px Fraunces', '300 60px Fraunces', '400 30px "IBM Plex Mono"'].map(f => document.fonts.load(f))) } catch { }
  let coverImg = null; if (b.coverUrl) { try { coverImg = b.coverUrl.startsWith('data:') ? await loadImg(b.coverUrl, true) : await loadImg(proxied(b.coverUrl), true).catch(() => loadImg(b.coverUrl, true)) } catch { } }
  const { bg, acc, fg } = colorsOf(b);
  let base, ink, mute, mark;
  if (style === 'spine') { base = bg; ink = fg; mute = fg; mark = acc }
  else if (style === 'night') { base = '#16140f'; ink = '#efe7d6'; mute = '#a99d88'; mark = lum(bg) < .05 ? acc : bg }
  else { base = '#f3ede1'; ink = '#1d1a16'; mute = '#7a7064'; mark = bg }
  x.fillStyle = base; x.fillRect(0, 0, W, H);
  const rnd = (s => () => (s = Math.imul(s ^ s >>> 15, 2246822507) ^ Math.imul(s ^ s >>> 13, 3266489909), (s >>> 0) / 4294967296))(hash(q.id) || 7);
  x.globalAlpha = .065; x.fillStyle = lum(base) > .3 ? '#3a2a18' : '#ffffff';
  for (let i = 0; i < 9000; i++) x.fillRect(rnd() * W, rnd() * H, 1.6, 1.6); x.globalAlpha = 1;
  if (style === 'paper') { x.fillStyle = bg; x.fillRect(0, 0, 26, H); x.fillStyle = acc; x.fillRect(26, 0, 5, H) }
  const L = 120, R = W - 110, maxW = R - L;
  x.fillStyle = mark; x.font = 'italic 400 260px Fraunces'; x.fillText('“', L - 18, 380);
  const text = q.text.replace(/\s+/g, ' ').trim();
  const wrap = fs => { x.font = `300 ${fs}px Fraunces`; const lines = []; let line = ''; for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w } else line = t } if (line) lines.push(line); return lines };
  let fs = 74, lines; const avail = H - 400 - 350;
  for (; fs >= 30; fs -= 2) { lines = wrap(fs); if (lines.length * fs * 1.32 <= avail) break }
  const lh = fs * 1.32;
  if (lines.length * lh > avail) { lines = lines.slice(0, Math.floor(avail / lh)); lines[lines.length - 1] += '…' }
  x.fillStyle = ink; x.font = `300 ${fs}px Fraunces`; lines.forEach((l, i) => x.fillText(l, L, 400 + fs * 1 + i * lh));
  const by = H - 270; let tx = L;
  if (coverImg) {
    const ch = 170, cw = ch * 2 / 3; x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 24; x.shadowOffsetY = 10;
    x.drawImage(coverImg, L, by, cw, ch); x.restore(); tx = L + cw + 36;
  } else { x.strokeStyle = mute; x.globalAlpha = .6; x.lineWidth = 2; x.beginPath(); x.moveTo(L, by); x.lineTo(L + 120, by); x.stroke(); x.globalAlpha = 1 }
  const tW = R - tx; x.fillStyle = ink; x.font = 'italic 400 44px Fraunces';
  let t = b.title; while (x.measureText(t).width > tW && t.length > 4) t = t.slice(0, -2); if (t !== b.title) t = t.trim() + '…';
  x.fillText(t, tx, by + (coverImg ? 70 : 70));
  x.fillStyle = mute; x.font = '400 26px "IBM Plex Mono"';
  let meta = [b.author, q.page ? 'p. ' + q.page : ''].filter(Boolean).join('  ·  ').toUpperCase();
  while (x.measureText(meta).width > tW && meta.length > 4) meta = meta.slice(0, -2);
  x.fillText(meta, tx, by + 120);
  x.globalAlpha = .55; x.font = '400 20px "IBM Plex Mono"'; x.fillText('BOOKIE', R - x.measureText('BOOKIE').width, H - 60); x.globalAlpha = 1;
}
function shareSheet(b, q) {
  openSheet((body) => {
    let style = 'paper';
    body.innerHTML = `<h2>Make a card</h2><p class="sub">${esc(b.title)}${q.page ? ' · p. ' + esc(q.page) : ''}</p>
      <div class="styles">${[['paper', 'Paper'], ['spine', 'Spine'], ['night', 'Night']].map(([k, l]) => `<button type="button" data-s="${k}" class="${k === style ? 'on' : ''}">${l}</button>`).join('')}</div>
      <canvas class="cardprev" id="s-cv"></canvas>
      <div class="actions"><button class="btn ghost" id="s-copy" type="button">Copy text</button><button class="btn primary" id="s-save" type="button">Share image</button></div>`;
    const cv = $('#s-cv', body); const draw = () => drawCard(cv, b, q, style); draw();
    $$('.styles button', body).forEach(x => x.onclick = () => { style = x.dataset.s; $$('.styles button', body).forEach(y => y.classList.toggle('on', y === x)); draw() });
    $('#s-copy', body).onclick = () => { const t = `“${q.text}”\n— ${b.title}${b.author ? ', ' + b.author : ''}${q.page ? ', p. ' + q.page : ''}`; navigator.clipboard.writeText(t).then(() => toast('Copied.'), () => toast('Couldn’t copy.')) };
    $('#s-save', body).onclick = () => cv.toBlob(async blob => {
      if (!blob) { toast('That cover blocks sharing — try the card without it.'); return }
      const slug = (b.title || 'line').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      const file = new File([blob], `${slug}${q.page ? '-p' + q.page : ''}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }) } catch { } return }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
}

/* ---------- sign in ---------- */
function renderGate() {
  S.mode = 'gate'; $('#fab').hidden = true;
  const spines = [[34, 110, '#8c2f39'], [46, 120, '#2f4858'], [28, 96, '#c9a227'], [40, 114, '#3c6e47'], [52, 104, '#e6d3ad'], [32, 118, '#4a3f6b']];
  $('#app').innerHTML = `<div class="gate">
    <div class="case" style="width:auto;margin:0 -24px"><div class="mini-shelf" style="padding:0 24px">${spines.map(([w, h, c]) => `<span style="width:${w}px;height:${h}px;background:${c}"></span>`).join('')}</div><div class="plank"><i class="top"></i><i class="front"></i></div></div>
    <h1>Book<em>ie</em></h1><p>A shelf for what you’re reading, and a place to keep the lines that stop you.</p>
    <form id="g-form"><label class="fld"><span>Email</span><input class="inp" type="email" id="g-email" required autocomplete="email" placeholder="you@example.com"></label>
    <div class="actions"><button class="btn primary" id="g-go" type="submit">Send me a sign-in link</button></div></form>
    <p class="hint" id="g-hint"></p></div>`;
  $('#g-form').onsubmit = async e => {
    e.preventDefault(); const email = $('#g-email').value.trim(); const btn = $('#g-go'); btn.disabled = true;
    const { error } = await S.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    btn.disabled = false;
    $('#g-hint').textContent = error ? (error.message || 'Couldn’t send — try again.') : 'Check your inbox and tap the link on this device.';
  };
}

/* ---------- boot ---------- */
$('#fab').onclick = () => bookSheet();
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const w = $$('.sheet-wrap.open').pop(); if (w) w.querySelector('.scrim').click(); else if (S.openId) closeDetail() } });

async function startCloud(session) {
  S.user = session.user; S.mode = 'cloud'; loadCache(); refresh();
  await pull(); subscribe();
}
(async () => {
  const demo = new URLSearchParams(location.search).has('demo');
  try { S.cfg = demo ? null : await (await fetch('api/config')).json() } catch { S.cfg = null }
  if (!S.cfg?.supabaseUrl) {
    S.mode = 'local'; loadCache();
    S.note = demo ? 'Demo mode — saving in this browser only.' : 'Preview — saving in this browser only. Sign-in and sync arrive with the Vercel version.';
    refresh(); return;
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  S.sb = createClient(S.cfg.supabaseUrl, S.cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  const { data: { session } } = await S.sb.auth.getSession();
  if (session) startCloud(session); else renderGate();
  S.sb.auth.onAuthStateChange((ev, sess) => { if (ev === 'SIGNED_IN' && sess && S.mode !== 'cloud') startCloud(sess); if (ev === 'SIGNED_OUT') renderGate() });
})();
