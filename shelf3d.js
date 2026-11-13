/* Bookie — the 3D bookcase.
   Three shelves fill one screen. Each shelf swipes sideways; tap a book to pull it out. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const BT = 2.0;      // board thickness
const HC = 25;       // clear height of a compartment
const PL = 11;       // plinth (kickboard) height — the carved buttons live here
const DEPTH = 26;    // shelf depth
const H = PL + BT + 3 * (HC + BT);
const FOV = 24;
const CAM_Y = .86;   // eye height, as a fraction of the bookcase
const ROWS = ['want', 'finished', 'reading'];          // bottom → top
const LABEL = { reading: 'READING NOW', finished: 'FINISHED', want: 'NEXT READ' };

/* ---------- procedural textures ---------- */
function hash2(seed) {
  return (x, y) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
    return (n >>> 0) / 4294967295;
  };
}
function vnoise(seed) {
  const h = hash2(seed), s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    const u = s(xf), v = s(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function woodCanvases(seed, light, dark, W = 1024, Hh = 256, rings = 9, warpAmt = 1) {
  const col = cnv(W, Hh), bump = cnv(W, Hh);
  const ci = col.getContext('2d').createImageData(W, Hh), bi = bump.getContext('2d').createImageData(W, Hh);
  const n1 = vnoise(seed), n2 = vnoise(seed + 11), n3 = vnoise(seed + 23);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const warp = (n1(x / 420, y / 40) * 1.1 + n2(x / 90, y / 12) * 0.25) * warpAmt;
    let g = y / Hh * rings + warp; g -= Math.floor(g);
    const ring = Math.pow(Math.abs(Math.sin(g * Math.PI)), 0.55);
    const fibre = n3(x / 55, y * 1.4) * 0.22 + n2(x / 9, y * 2.3) * 0.08;
    const v = Math.min(1, Math.max(0, ring * 0.72 + fibre));
    const c = mix(dark, light, v); const i = (y * W + x) * 4;
    ci.data[i] = c[0]; ci.data[i + 1] = c[1]; ci.data[i + 2] = c[2]; ci.data[i + 3] = 255;
    const b = Math.round(255 * (0.55 + ring * 0.3 + fibre * 0.6) / 1.5);
    bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = b; bi.data[i + 3] = 255;
  }
  col.getContext('2d').putImageData(ci, 0, 0); bump.getContext('2d').putImageData(bi, 0, 0);
  return { col, bump };
}
function fbm(n, x, y, oct = 4) { let a = 0, amp = .5, f = 1; for (let i = 0; i < oct; i++) { a += n(x * f, y * f) * amp; f *= 2.03; amp *= .5; } return a; }
// Walnut veneer: long continuous grain, fine pores, colour streaks along the board, the odd figure.
function walnutCanvases(seed, W = 2048, Hh = 512, opts = {}) {
  const { lines = 90, tone = 0 } = opts;
  const col = cnv(W, Hh), bump = cnv(W, Hh), rgh = cnv(W, Hh);
  const ci = col.getContext('2d').createImageData(W, Hh), bi = bump.getContext('2d').createImageData(W, Hh), ri = rgh.getContext('2d').createImageData(W, Hh);
  const n1 = vnoise(seed), n2 = vnoise(seed + 17), n3 = vnoise(seed + 31), n4 = vnoise(seed + 47), hp = hash2(seed + 5);
  // palette: dark heartwood, mid brown, warm highlights, grey-violet cast typical of walnut
  const dark = [44 + tone, 27 + tone, 16 + tone], mid = [92 + tone, 60 + tone, 38 + tone], warm = [128 + tone, 86 + tone, 52 + tone], cool = [70, 54, 46];
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / Hh;
    // grain coordinate: mostly straight, slowly drifting, with a gentle cathedral figure
    const drift = fbm(n1, u * 2.2, v * 3.5, 4) * (opts.drift ?? 2.4);
    const cath = Math.sin(v * Math.PI * 2.2 + Math.sin(u * Math.PI * 1.3 + seed) * 1.4) * (opts.figure ?? .6);
    const g = v * lines + drift * 5 + cath * 3;
    const f = g - Math.floor(g);
    const late = Math.pow(Math.max(0, 1 - Math.abs(f - .5) * 2), 7);          // dark late-wood line
    const early = Math.pow(Math.max(0, 1 - Math.abs(f - .15) * 3.2), 3) * .35;  // soft lighter band
    const streak = fbm(n2, u * 1.4, v * 9, 3);                                  // long colour streaks
    const broad = fbm(n3, u * .7, v * 1.6, 2);                                  // board-scale tone
    // pores: short dark dashes stretched along the grain
    const pore = hp(Math.floor(x / 7), Math.floor(y * 1.0)) > .985 ? .55 : 0;
    const fib = (n4(u * 380, v * 60) - .5) * .12;
    let t = .52 + (streak - .5) * .55 + (broad - .5) * .35 + early - late * .55 - pore + fib;
    t = Math.min(1, Math.max(0, t));
    let c = t < .5 ? mix(dark, mid, t * 2) : mix(mid, warm, (t - .5) * 2);
    c = mix(c, cool, Math.max(0, (.5 - streak)) * .35);                         // greyish cast in places
    const i = (y * W + x) * 4;
    ci.data[i] = c[0]; ci.data[i + 1] = c[1]; ci.data[i + 2] = c[2]; ci.data[i + 3] = 255;
    const b = Math.round(255 * Math.min(1, Math.max(0, .62 - late * .25 - pore * .5 + fib)));
    bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = b; bi.data[i + 3] = 255;
    const r = Math.round(255 * Math.min(1, .66 + late * .15 + pore * .3 + (streak - .5) * .14));   // pores and lines are duller
    ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = r; ri.data[i + 3] = 255;
  }
  col.getContext('2d').putImageData(ci, 0, 0); bump.getContext('2d').putImageData(bi, 0, 0); rgh.getContext('2d').putImageData(ri, 0, 0);
  return { col, bump, rgh };
}
function mapleCanvases(seed, light, dark, W = 2048, Hh = 512, opts = {}) {
  const { lines = 120, cathedral = .35, knots = 2, contrast = 1 } = opts;
  const col = cnv(W, Hh), bump = cnv(W, Hh);
  const ci = col.getContext('2d').createImageData(W, Hh), bi = bump.getContext('2d').createImageData(W, Hh);
  const n1 = vnoise(seed), n2 = vnoise(seed + 13), n3 = vnoise(seed + 29), h = hash2(seed + 3);
  const ks = Array.from({ length: knots }, (_, i) => ({ x: h(i, 1) * W, y: (.2 + h(i, 2) * .6) * Hh, r: 10 + h(i, 3) * 18 }));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    let yy = y + n1(x / 380, y / 60) * 26 + n2(x / 120, y / 30) * 6;
    // knots bend the grain around them
    let kd = 0;
    for (const k of ks) { const dx = (x - k.x) / (k.r * 3.2), dy = (y - k.y) / k.r; const d = dx * dx + dy * dy; if (d < 9) { yy += (y - k.y) * 1.6 / (1 + d); kd = Math.max(kd, Math.exp(-d * 1.8)); } }
    // cathedral arches from slow sine bands
    const cath = Math.sin((yy / Hh) * Math.PI * 3 + Math.sin(x / W * Math.PI * 2 + seed) * 2.2) * cathedral;
    const g = (yy / Hh) * lines + cath * 6;
    const fr = g - Math.floor(g);
    const late = Math.pow(1 - Math.abs(fr * 2 - 1), 6);           // thin dark late-wood lines
    const fibre = n3(x / 22, y * 1.7) * .5 + n2(x / 5, y * 3.1) * .25; // fine fibres along the board
    let v = .78 - late * .42 * contrast - (fibre - .37) * .28 * contrast - kd * .55 + (n1(x / 600, y / 200) - .5) * .18;
    v = Math.min(1, Math.max(0, v));
    const c = mix(dark, light, v); const i = (y * W + x) * 4;
    ci.data[i] = c[0]; ci.data[i + 1] = c[1]; ci.data[i + 2] = c[2]; ci.data[i + 3] = 255;
    const b = Math.round(255 * Math.min(1, .62 - late * .3 + fibre * .25 - kd * .2));
    bi.data[i] = bi.data[i + 1] = bi.data[i + 2] = b; bi.data[i + 3] = 255;
  }
  col.getContext('2d').putImageData(ci, 0, 0); bump.getContext('2d').putImageData(bi, 0, 0);
  return { col, bump };
}
// Curved-spine normal map: light rolls across a rounded spine.
function spineNormalCanvas() {
  const w = 128, c = cnv(w, 4), x = c.getContext('2d'), im = x.createImageData(w, 4);
  for (let u = 0; u < w; u++) {
    const t = u / (w - 1) * 2 - 1;                 // -1..1 across the spine
    const th = Math.sign(t) * Math.pow(Math.abs(t), 1.6) * 1.05;   // flatter in the middle, rolls off at the joints
    const nx = Math.sin(th), nz = Math.cos(th);
    for (let v = 0; v < 4; v++) { const i = (v * w + u) * 4; im.data[i] = (nx * .5 + .5) * 255; im.data[i + 1] = 128; im.data[i + 2] = (nz * .5 + .5) * 255; im.data[i + 3] = 255; }
  }
  x.putImageData(im, 0, 0); return c;
}
function clothCanvas(seed = 3) {
  const S = 256, c = cnv(S, S), x = c.getContext('2d'), im = x.createImageData(S, S), n = vnoise(seed), h = hash2(seed + 5);
  for (let y = 0; y < S; y++) for (let X = 0; X < S; X++) {
    const weave = ((X % 2) ^ (y % 2)) * 18 + Math.sin(X * 1.7) * 6 + Math.sin(y * 1.9) * 6;
    const v = 150 + weave + (n(X / 18, y / 18) - .5) * 40 + (h(X, y) - .5) * 30;
    const i = (y * S + X) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
  }
  x.putImageData(im, 0, 0); return c;
}
function aoCanvas() {
  const w = 256, h = 256, c = cnv(w, h), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(40,20,5,.55)'); g.addColorStop(.12, 'rgba(40,20,5,.2)'); g.addColorStop(.4, 'rgba(0,0,0,0)'); g.addColorStop(.92, 'rgba(0,0,0,.04)'); g.addColorStop(1, 'rgba(40,20,5,.22)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(30,15,5,.45)'); g.addColorStop(.07, 'rgba(30,15,5,.12)'); g.addColorStop(.18, 'rgba(0,0,0,0)'); g.addColorStop(.82, 'rgba(0,0,0,0)'); g.addColorStop(.93, 'rgba(30,15,5,.12)'); g.addColorStop(1, 'rgba(30,15,5,.45)');
  x.fillStyle = g; x.fillRect(0, 0, w, h); return c;
}
function pagesCanvas() {
  const c = cnv(512, 64), x = c.getContext('2d'), h = hash2(77);
  x.fillStyle = '#efe5cf'; x.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 512; i++) {
    const t = h(i, 1); x.fillStyle = `rgba(120,95,60,${0.05 + t * 0.16})`; x.fillRect(i, 0, 1, 64);
  }
  const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(90,70,40,.12)'); g.addColorStop(.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,40,.12)');
  x.fillStyle = g; x.fillRect(0, 0, 512, 64); return c;
}
function rgbOf(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function shade(hex, k) { return '#' + rgbOf(hex).map(v => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')).join(''); }
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

const PPU = 36; // texture pixels per world unit
const FONTS = {
  serif: w => `600 ${w}px Fraunces, Georgia, serif`,
  serifIt: w => `italic 500 ${w}px "Playfair Display", Fraunces, Georgia, serif`,
  display: w => `600 ${w}px "Playfair Display", Georgia, serif`,
  cond: w => `600 ${w}px Oswald, "Arial Narrow", sans-serif`,
  heavy: w => `400 ${w}px "Archivo Black", "Arial Black", sans-serif`,
  mono: w => `500 ${w}px "IBM Plex Mono", monospace`,
};
function fitFont(x, text, fontFn, maxSize, minSize, avail) {
  let fs = maxSize; x.font = fontFn(fs);
  while (x.measureText(text).width > avail && fs > minSize) { fs -= 1; x.font = fontFn(fs); }
  let t = text; while (x.measureText(t).width > avail && t.length > 3) t = t.slice(0, -2).trimEnd() + '…';
  return { fs, t };
}
function surnameOf(a) { return (a || '').split(/,|&| and /)[0].trim().split(/\s+/).pop() || ''; }
function logo(x, cx, cy, r, kind, ink) {
  x.save(); x.fillStyle = ink; x.strokeStyle = ink; x.lineWidth = Math.max(1.5, r * .18);
  if (kind === 0) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
  else if (kind === 1) { x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  else if (kind === 2) { x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy + r * .8); x.lineTo(cx - r, cy + r * .8); x.closePath(); x.fill(); }
  else if (kind === 3) { x.strokeRect(cx - r, cy - r, r * 2, r * 2); x.font = `700 ${r * 1.3}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('P', cx, cy + r * .05); }
  else { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, r * .45, 0, 7); x.fill(); }
  x.restore();
}
// Draws type for a spine. style picks one of several layouts real publishers use.
function typeSpine(x, w, h, b, style, ink, acc) {
  const title = b.title || 'Untitled', author = b.author || '', sur = surnameOf(author);
  const hv = hashStr(b.id), wide = w >= 3.1 * PPU;
  x.fillStyle = ink; x.textBaseline = 'middle';
  const vertical = (text, fontFn, maxFs, top, len, caps) => {
    const t = caps ? text.toUpperCase() : text;
    x.save(); x.translate(w / 2, top); x.rotate(Math.PI / 2); x.textAlign = 'left';
    const f = fitFont(x, t, fontFn, maxFs, Math.max(9, w * .28), len); x.fillText(f.t, 0, 0); x.restore();
    return f.fs;
  };
  const horizStack = (text, fontFn, maxFs, top, maxLines) => {
    const words = text.split(/\s+/); x.textAlign = 'center'; let fs = maxFs, lines;
    for (; fs > 10; fs--) {
      x.font = fontFn(fs); lines = []; let line = '';
      for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (x.measureText(t).width > w * .82 && line) { lines.push(line); line = wd; } else line = t; }
      if (line) lines.push(line);
      if (lines.length <= maxLines && lines.every(l => x.measureText(l).width <= w * .86)) break;
    }
    lines.slice(0, maxLines).forEach((l, i) => x.fillText(l, w / 2, top + i * fs * 1.12));
    return top + lines.length * fs * 1.12;
  };
  const kind = hv % 5, logoR = Math.min(w * .17, 12);
  if (style === 'stack' && wide) {
    const end = horizStack(title, FONTS.display, Math.min(w * .2, 30), h * .07, 5);
    x.fillStyle = acc; x.fillRect(w * .3, end + 6, w * .4, 2); x.fillStyle = ink;
    x.textAlign = 'center'; x.font = FONTS.mono(Math.min(w * .1, 15)); x.fillText(sur.toUpperCase(), w / 2, h * .86);
    logo(x, w / 2, h * .95, logoR, kind, ink);
  } else if (style === 'cond') {
    vertical(title, FONTS.cond, w * .62, h * .05, h * .66, true);
    x.save(); x.globalAlpha = .85; vertical(author, FONTS.cond, w * .34, h * .74, h * .17, true); x.restore();
    logo(x, w / 2, h * .955, logoR, kind, ink);
  } else if (style === 'block') {
    x.fillStyle = acc; x.fillRect(0, 0, w, h * .2); x.fillStyle = ink;
    x.save(); x.fillStyle = textOnHex(acc); x.textAlign = 'center';
    if (wide) { x.font = FONTS.mono(Math.min(w * .11, 14)); x.fillText(sur.toUpperCase(), w / 2, h * .1); }
    else { vertical(sur, FONTS.mono, w * .3, h * .025, h * .15, true); }
    x.restore();
    vertical(title, FONTS.heavy, w * .5, h * .24, h * .62, false);
    logo(x, w / 2, h * .95, logoR, kind, ink);
  } else if (style === 'quiet') {
    const fs = vertical(title, FONTS.serifIt, w * .36, h * .3, h * .4, false);
    x.save(); x.globalAlpha = .7; vertical(author, FONTS.serif, Math.min(fs * .7, w * .26), h * .76, h * .14, false); x.restore();
    logo(x, w / 2, h * .955, logoR * .8, kind, ink);
  } else if (style === 'heavy') {
    vertical(title, FONTS.heavy, w * .56, h * .06, h * .64, true);
    x.fillStyle = acc; x.fillRect(w * .2, h * .73, w * .6, 2); x.fillStyle = ink;
    vertical(sur, FONTS.serif, w * .32, h * .76, h * .14, false);
    logo(x, w / 2, h * .955, logoR, kind, ink);
  } else { // classic: serif title, gilt bands
    x.fillStyle = acc; x.fillRect(0, h * .04, w, 4); x.fillRect(0, h * .04 + 8, w, 1.5); x.fillRect(0, h * .955, w, 4); x.fillRect(0, h * .955 - 6, w, 1.5);
    x.fillStyle = ink;
    vertical(title, FONTS.serif, w * .44, h * .1, h * .62, false);
    x.save(); x.globalAlpha = .85; vertical(sur, FONTS.mono, w * .25, h * .76, h * .15, true); x.restore();
  }
}
function hinges(x, w, h) {
  // the joint where spine meets each board: a fine groove with a lit lip
  for (const gx of [w * .045, w * .955]) {
    x.fillStyle = 'rgba(0,0,0,.38)'; x.fillRect(gx - 1, 0, 2, h);
    x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(gx + (gx < w / 2 ? 1 : -2), 0, 1, h);
  }
}
function wear(x, w, h, b, dims) {
  const hv = hashStr(b.id + 'w'), st = b.status || 'reading', r = n => ((hv >>> n) & 255) / 255, nz = hash2(hv % 997);
  // head and tail rubbed pale from being pulled off the shelf
  for (const top of [true, false]) {
    const gh = h * .03, y0 = top ? 0 : h - gh;
    const g = x.createLinearGradient(0, top ? 0 : h, 0, top ? gh : h - gh);
    g.addColorStop(0, 'rgba(255,244,222,.28)'); g.addColorStop(1, 'rgba(255,244,222,0)'); x.fillStyle = g; x.fillRect(0, y0, w, gh);
    for (let i = 0; i < w / 3; i++) { x.fillStyle = `rgba(255,248,232,${nz(i, top ? 1 : 2) * .35})`; x.fillRect(nz(i, 3) * w, top ? 0 : h - 3, 2, 2 + nz(i, 4) * 3); }
  }
  // sun-faded tops on books that have sat a while
  if (st !== 'want' && r(3) > .45) {
    const g = x.createLinearGradient(0, 0, 0, h * .5); g.addColorStop(0, 'rgba(255,238,210,.2)'); g.addColorStop(1, 'rgba(255,238,210,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h * .5);
  }
  // reading creases down paperback spines
  if (!dims.hard && st !== 'want') {
    const n = st === 'finished' ? 2 + Math.floor(r(5) * 3) : 1 + Math.floor(r(5) * 2);
    for (let i = 0; i < n; i++) {
      let cx = w * (.22 + r(7 + i) * .56); const y0 = h * (.06 + r(9 + i) * .25), y1 = h * (.6 + r(11 + i) * .34);
      const pts = []; for (let y = y0; y <= y1; y += h / 50) { cx += (nz(i, y | 0) - .5) * 2.4; pts.push([cx, y]); }
      for (const [dx, colr, lw] of [[1.2, 'rgba(0,0,0,.09)', 1], [0, 'rgba(255,250,240,.24)', 1]]) {
        x.beginPath(); pts.forEach(([px, py], k) => (k && nz(k, i + 7) > .18) ? x.lineTo(px + dx, py) : x.moveTo(px + dx, py)); x.strokeStyle = colr; x.lineWidth = lw; x.stroke();
      }
    }
  }
}
function textOnHex(hex) { const [r, g, b] = rgbOf(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > .55 ? '#1d1a16' : '#f6efe2'; }
const STYLES = ['classic', 'cond', 'block', 'quiet', 'heavy', 'stack'];
function styleOf(b, w) { const hv = hashStr(b.id + 's'); let s = STYLES[hv % STYLES.length]; if (s === 'stack' && w < 3.1 * PPU) s = 'cond'; return s; }
function speckle(x, w, h, seed, amt = 1) {
  const hh = hash2(seed % 1000);
  for (let i = 0; i < w * h / 7; i++) { const a = hh(i, 3); x.fillStyle = a > .5 ? `rgba(255,255,255,${(a - .5) * .06 * amt})` : `rgba(0,0,0,${a * .07 * amt})`; x.fillRect(hh(i, 1) * w, hh(i, 2) * h, 1.3, 1.3); }
}
function spineCanvas(b, dims, col) {
  const w = Math.max(48, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
  const c = cnv(w, h), x = c.getContext('2d'), hv = hashStr(b.id);
  x.fillStyle = col.bg; x.fillRect(0, 0, w, h);
  speckle(x, w, h, hv);
  const ink = col.lumDark ? (hv % 3 === 0 ? '#ead9a8' : col.fg) : col.fg;
  const acc = col.lumDark ? (hv % 2 ? '#d9b866' : col.acc) : col.acc;
  typeSpine(x, w, h, b, styleOf(b, w), ink, acc);
  wear(x, w, h, b, dims);
  if (dims.hard) hinges(x, w, h);
  return c;
}
function coverCanvas(b, col) {
  const w = 300, h = 450, c = cnv(w, h), x = c.getContext('2d');
  x.fillStyle = col.bg; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,.3)'); g.addColorStop(.06, 'rgba(255,255,255,.08)'); g.addColorStop(.1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = col.fg; x.font = '500 34px Fraunces, Georgia, serif';
  const words = (b.title || '').split(' '); let line = '', y = 70; const lines = [];
  for (const wd of words) { const tt = line ? line + ' ' + wd : wd; if (x.measureText(tt).width > w - 60 && line) { lines.push(line); line = wd; } else line = tt; } if (line) lines.push(line);
  lines.slice(0, 5).forEach(l => { x.fillText(l, 30, y); y += 40; });
  x.fillStyle = col.acc; x.fillRect(30, y - 10, 60, 3);
  x.fillStyle = col.fg; x.globalAlpha = .85; x.font = '500 15px "IBM Plex Mono", monospace'; x.fillText((b.author || '').toUpperCase().slice(0, 28), 30, h - 36);
  return c;
}
// Brass label plate: colour, roughness and normal maps from one height field.
function brassMaps(text) {
  const w = 1024, h = 200, S = 2;
  const H = cnv(w, h), hx = H.getContext('2d');
  // height: raised plate with a bevelled rim, two domed screws, engraved (sunk) letters
  hx.fillStyle = '#000'; hx.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { const v = Math.round(255 * (.35 + .65 * i / 13)); hx.fillStyle = `rgb(${v},${v},${v})`; const r = 22 - i; hx.beginPath(); hx.roundRect(i, i, w - 2 * i, h - 2 * i, Math.max(2, r)); hx.fill(); }
  const sx = [46, w - 46];
  for (const cx of sx) { const g = hx.createRadialGradient(cx - 4, h / 2 - 4, 1, cx, h / 2, 17); g.addColorStop(0, '#fff'); g.addColorStop(.85, '#bbb'); g.addColorStop(1, '#555'); hx.fillStyle = g; hx.beginPath(); hx.arc(cx, h / 2, 17, 0, 7); hx.fill(); }
  hx.font = '600 76px "IBM Plex Mono", ui-monospace, monospace'; hx.textAlign = 'center'; hx.textBaseline = 'middle';
  hx.fillStyle = '#6a6a6a'; hx.fillText(text, w / 2, h / 2 + 3);
  const hd = hx.getImageData(0, 0, w, h).data;
  // normal map via sobel
  const N = cnv(w, h), nx = N.getContext('2d'), ni = nx.createImageData(w, h);
  const at = (x, y) => hd[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * S, dy = (at(x, y + 1) - at(x, y - 1)) * S;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    ni.data[i] = (-dx / l * .5 + .5) * 255; ni.data[i + 1] = (dy / l * .5 + .5) * 255; ni.data[i + 2] = (1 / l * .5 + .5) * 255; ni.data[i + 3] = 255;
  }
  nx.putImageData(ni, 0, 0);
  // colour: polished brass, darker patina in the engraving and screw slots, fingerprints of age
  const C = cnv(w, h), cx = C.getContext('2d');
  const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d8b46a'); g.addColorStop(.5, '#c39a4c'); g.addColorStop(1, '#a98236'); cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  const hh = hash2(41);
  for (let i = 0; i < 9000; i++) { const y = hh(i, 2) * h; cx.fillStyle = `rgba(${hh(i, 5) > .5 ? '255,236,190' : '90,62,20'},${hh(i, 1) * .1})`; cx.fillRect(hh(i, 3) * w, y, 30 + hh(i, 4) * 120, 1); }
  for (let i = 0; i < 6; i++) { const r = cx.createRadialGradient(hh(i, 9) * w, hh(i, 10) * h, 2, hh(i, 9) * w, hh(i, 10) * h, 60 + hh(i, 11) * 80); r.addColorStop(0, 'rgba(70,50,20,.12)'); r.addColorStop(1, 'rgba(70,50,20,0)'); cx.fillStyle = r; cx.fillRect(0, 0, w, h); }
  cx.font = hx.font; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillStyle = '#2b1e0c'; cx.fillText(text, w / 2, h / 2 + 3);
  for (const sxp of sx) { cx.strokeStyle = 'rgba(40,28,10,.85)'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(sxp - 11, h / 2 - 6); cx.lineTo(sxp + 11, h / 2 + 6); cx.stroke(); }
  // roughness: brushed metal, rougher in the grooves
  const R = cnv(w, h), rx = R.getContext('2d'); rx.fillStyle = 'rgb(80,80,80)'; rx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i++) { const v = 50 + hh(i, 7) * 70; rx.fillStyle = `rgb(${v},${v},${v})`; rx.fillRect(hh(i, 3) * w, hh(i, 2) * h, 40 + hh(i, 6) * 160, 1); }
  rx.font = hx.font; rx.textAlign = 'center'; rx.textBaseline = 'middle'; rx.fillStyle = 'rgb(220,220,220)'; rx.fillText(text, w / 2, h / 2 + 3);
  return { color: C, normal: N, rough: R };
}

// Carved icon in wood: transparent everywhere but the grooves, with a bevel normal map.
function blurGray(d, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let k = -r; k <= r; k++) a += d[y * w + Math.min(w - 1, Math.max(0, x + k))]; tmp[y * w + x] = a / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let a = 0; for (let k = -r; k <= r; k++) a += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]; out[y * w + x] = a / n; }
  return out;
}
function carveMaps(kind, caption) {
  const word = kind === 'word';
  const w = word ? 1024 : 256, h = word ? 240 : 256, c = cnv(w, h), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.strokeStyle = '#000'; x.fillStyle = '#000'; x.lineCap = 'round'; x.lineJoin = 'round';
  if (word) {
    x.font = '800 142px Fraunces, "Playfair Display", Georgia, serif'; if ('letterSpacing' in x) x.letterSpacing = '2px'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(caption, w / 2, h / 2 + 6);
  } else if (kind === 'lamp') {
    x.lineWidth = 11;
    x.beginPath(); x.arc(128, 112, 54, Math.PI * .72, Math.PI * .28); x.lineTo(150, 176); x.lineTo(106, 176); x.closePath(); x.stroke();
    x.lineWidth = 9; x.beginPath(); x.moveTo(108, 196); x.lineTo(148, 196); x.moveTo(114, 214); x.lineTo(142, 214); x.stroke();
    x.lineWidth = 8; for (const a of [-2.6, -2.05, -1.57, -1.09, -.54]) { x.beginPath(); x.moveTo(128 + Math.cos(a) * 74, 112 + Math.sin(a) * 74); x.lineTo(128 + Math.cos(a) * 96, 112 + Math.sin(a) * 96); x.stroke(); }
  } else if (kind === 'add') {
    x.lineWidth = 11; x.beginPath(); x.arc(128, 124, 92, 0, 7); x.stroke();
    x.lineWidth = 13; x.beginPath(); x.moveTo(128, 78); x.lineTo(128, 170); x.moveTo(82, 124); x.lineTo(174, 124); x.stroke();
  } else {
    x.lineWidth = 11;
    x.beginPath(); x.moveTo(128, 88); x.quadraticCurveTo(88, 62, 34, 74); x.lineTo(34, 182); x.quadraticCurveTo(88, 170, 128, 196); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(128, 88); x.quadraticCurveTo(168, 62, 222, 74); x.lineTo(222, 182); x.quadraticCurveTo(168, 170, 128, 196); x.stroke();
    x.lineWidth = 6; for (const [a, b2] of [[60, 108], [60, 132], [60, 156]]) { x.beginPath(); x.moveTo(a, b2 - 6); x.lineTo(a + 44, b2 + 2); x.stroke(); x.beginPath(); x.moveTo(256 - a, b2 - 6); x.lineTo(256 - a - 44, b2 + 2); x.stroke(); }
  }
  const raw = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = raw[i * 4] / 255;            // 1 = wood surface, 0 = bottom of the groove
  const hgt = blurGray(g, w, h, 3);
  const col = cnv(w, h), cx = col.getContext('2d'), ci = cx.createImageData(w, h);
  const nrm = cnv(w, h), nx = nrm.getContext('2d'), ni = nx.createImageData(w, h);
  const at = (X, Y) => hgt[Math.min(h - 1, Math.max(0, Y)) * w + Math.min(w - 1, Math.max(0, X))];
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
    const i = Y * w + X, depth = 1 - hgt[i];
    const dx = (at(X + 1, Y) - at(X - 1, Y)) * 4, dy = (at(X, Y + 1) - at(X, Y - 1)) * 4, l = Math.hypot(dx, dy, 1);
    ni.data[i * 4] = (-dx / l * .5 + .5) * 255; ni.data[i * 4 + 1] = (dy / l * .5 + .5) * 255; ni.data[i * 4 + 2] = (1 / l * .5 + .5) * 255; ni.data[i * 4 + 3] = 255;
    // groove: dark, burnished wood; alpha follows depth so the edge blends into the grain
    ci.data[i * 4] = word ? 214 : 14; ci.data[i * 4 + 1] = word ? 176 : 7; ci.data[i * 4 + 2] = word ? 104 : 3; ci.data[i * 4 + 3] = depth < .04 ? 0 : Math.min(255, Math.round(Math.pow(depth, .7) * 400));
  }
  cx.putImageData(ci, 0, 0); nx.putImageData(ni, 0, 0);
  return { color: col, normal: nrm, aspect: h / w };
}

/* ---------- wood: a solid 3D shader, evaluated per pixel ---------- */
const WOOD_GLSL = /* glsl */`
uniform float uAxis; uniform vec3 uSeed; uniform float uPlank; uniform float uTone;
varying vec3 vWoodP;
float wh13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float wn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(wh13(i), wh13(i + vec3(1,0,0)), f.x), mix(wh13(i + vec3(0,1,0)), wh13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wh13(i + vec3(0,0,1)), wh13(i + vec3(1,0,1)), f.x), mix(wh13(i + vec3(0,1,1)), wh13(i + vec3(1,1,1)), f.x), f.y), f.z); }
float wfbm(vec3 p){ float a = 0., w = .5; for (int i = 0; i < 4; i++) { a += wn(p) * w; p = p * 2.03 + 7.1; w *= .5; } return a; }
// The board is cut from a virtual log: growth rings wrap an axis that runs along the grain.
void woodEval(vec3 P, out vec3 col, out float hgt, out float rgh){
  vec3 p = uAxis < .5 ? P.xyz : P.yxz;                 // p.x runs along the grain
  float seam = 1.;
  if (uPlank > 0.) {                                    // boards joined edge to edge, each from a different part of the tree
    float k = p.y / uPlank, id = floor(k), fk = fract(k);
    seam = smoothstep(0., .014, fk) * smoothstep(1., .986, fk);
    p += vec3(wh13(vec3(id, 1., 2.)) * 90., 0., wh13(vec3(id, 5., 3.)) * 30. + id * 2.7);
  }
  p += uSeed;
  vec3 q = p;
  q.yz += (wfbm(vec3(p.x * .018, p.yz * .14)) - .5) * 1.3;         // the trunk is never straight
  q.yz += (wn(vec3(p.x * .1, p.yz * .9)) - .5) * .06;
  float r = length(q.yz - vec2(2., -34.)) * 5.2;                   // distance from the pith
  float ring = fract(r), rid = floor(r);
  float yr = wh13(vec3(rid, 7., 3.));                              // every year grew differently
  float late = smoothstep(.45, .96, ring) * (1. - smoothstep(.96, 1., ring));   // darkens through the season, then starts again
  float fibre = wn(vec3(p.x * .6, p.yz * 14.));
  float fine = wn(vec3(p.x * 1.8, p.yz * 26.));
  float pore = smoothstep(.83, .92, wn(vec3(p.x * 1.4, p.yz * 24.))) * (1. - .6 * late);   // open pores, drawn out along the grain
  float streak = wfbm(vec3(p.x * .01, p.yz * .3));               // long heartwood streaks
  vec3 cE = vec3(.150, .074, .034), cL = vec3(.050, .023, .011), cW = vec3(.215, .110, .050), cG = vec3(.080, .048, .030);
  col = mix(cE, cL, late * (.26 + .3 * yr));
  col *= .9 + yr * .2;
  col = mix(col, cG, smoothstep(.5, .8, streak) * .4);
  col = mix(col, cW, smoothstep(.5, .2, streak) * .35);
  col *= .92 + fibre * .16;
  col *= 1. - fine * .1;
  col = mix(col, cL * .6, pore * .5);
  col *= mix(.18, 1., seam) * uTone;
  hgt = -late * .22 - pore * .8 + fibre * .1 - (1. - seam) * 2.5;
  rgh = .46 + late * .08 + pore * .22 - (fibre - .5) * .08 + (streak - .5) * .08;
}
`;
function woodMaterial(axis, seed, plank = 0, tone = 1) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .5, metalness: 0, envMapIntensity: .13, specularIntensity: .5, specularColor: new THREE.Color('#ffcf9a'), clearcoat: .1, clearcoatRoughness: .3, sheen: 0 });
  m.envMapIntensity = .02;
  m.onBeforeCompile = sh => {
    sh.uniforms.uAxis = { value: axis }; sh.uniforms.uPlank = { value: plank }; sh.uniforms.uTone = { value: tone };
    sh.uniforms.uSeed = { value: new THREE.Vector3((seed * 37.7) % 211, (seed * 7.3) % 17, (seed * 3.1) % 13) };
    sh.vertexShader = 'varying vec3 vWoodP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWoodP = position;');
    sh.fragmentShader = WOOD_GLSL + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  vec3 wCol; float wH; float wR; woodEval(vWoodP, wCol, wH, wR); diffuseColor.rgb = wCol;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(wR, .25, 1.);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 wdx = dFdx(-vViewPosition), wdy = dFdy(-vViewPosition); float hx = dFdx(wH), hy = dFdy(wH);
    vec3 r1 = cross(wdy, normal), r2 = cross(normal, wdx); float det = dot(wdx, r1);
    normal = normalize(abs(det) * normal - .07 * sign(det) * (hx * r1 + hy * r2)); }`);
  };
  m.customProgramCacheKey = () => 'bookie-wood';
  return m;
}

/* ---------- the bookcase ---------- */
export async function createShelf3D(el, opts) {
  const { colorsOf, onPick, coverSrc, onDismiss } = opts;
  let lamps = !!opts.lamps, envLoaded = false; const lampObjs = [], lampPucks = []; let anchors = opts.anchors || {}; const anchorBoxes = [];
  try { await Promise.all(['500 40px Fraunces', '800 100px Fraunces', '500 20px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch { }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); scene.background = new THREE.Color('#3a2414');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  // real light captured in an apartment (CC0, Poly Haven via pmndrs/assets)
  const envReady = new Promise(res => new EXRLoader().load(new URL('./assets/apartment.exr', import.meta.url).href, t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(t).texture; t.dispose();
    scene.environmentRotation.set(0, Math.PI * .85, 0); envLoaded = true; applyLamps();
    needs = true; res(true);
  }, undefined, () => res(false)));
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2000);

  const hemi = new THREE.HemisphereLight(0xfff4e4, 0x6b4a2c, 0.12); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffc98c, 3.0); key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.radius = 7; key.shadow.blurSamples = 16;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffd6a2, 0.25); fill.position.set(0, H * .45, 200); scene.add(fill);
  const rake = new THREE.DirectionalLight(0xffd6a2, 0.35); rake.position.set(160, H * .6, 70); scene.add(rake);

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (canvas, srgb = true, rep) => { const t = new THREE.CanvasTexture(canvas); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; if (rep) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; } return t; };
  const clothTex = tex(clothCanvas(), false, 1); clothTex.repeat.set(3, 3);
  const pagesTex = tex(pagesCanvas());
  const pagesMat = new THREE.MeshStandardMaterial({ map: pagesTex, roughness: .92, metalness: 0 });
  const gradTex = (() => { const c = cnv(64, 2), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.35, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 2);
    const t = new THREE.CanvasTexture(c); return t; })();
  const edgeAOMat = new THREE.MeshBasicMaterial({ map: gradTex, transparent: true, opacity: .5, depthWrite: false });
  const vGradTex = (() => { const c = cnv(2, 64), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.4, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 2, 64);
    return new THREE.CanvasTexture(c); })();
  const floorAOMat = new THREE.MeshBasicMaterial({ map: vGradTex, transparent: true, opacity: .5, depthWrite: false });
  const ironMat = new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: .7, roughness: .42 });
  const brassEdge = new THREE.MeshStandardMaterial({ color: '#b48c42', metalness: 1, roughness: .38 });
  const spineNormal = new THREE.CanvasTexture(spineNormalCanvas()); spineNormal.colorSpace = THREE.NoColorSpace; spineNormal.wrapT = THREE.RepeatWrapping;

  const caseGroup = new THREE.Group(), booksGroup = new THREE.Group(); scene.add(caseGroup, booksGroup);
  let visW = 50, rows = [], books = [], view = 'spines', needs = true, raf = 0, disposed = false, paused = false;
  const texCache = new Map(), coverCache = new Map(), tweens = [];
  const geoms = [];

  function frame() {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return false;
    renderer.setSize(w, h, false);
    const d = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)), yc = H * CAM_Y, fullH = h * (2 * yc / H);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(yc / d));
    camera.setViewOffset(w, fullH, 0, fullH - h, w, h);
    camera.position.set(0, yc, d); camera.lookAt(0, yc, 0); camera.updateProjectionMatrix();
    visW = H * (w / h);
    return true;
  }
  function placeAnchors() {
    const r = el.getBoundingClientRect(), v = new THREE.Vector3();
    for (const a of anchorBoxes) {
      const node = anchors[a.kind]; if (!node) continue;
      const pts = [[a.x - a.w / 2, a.y + a.h / 2], [a.x + a.w / 2, a.y - a.h / 2]].map(([px, py]) => { v.set(px, py, .32).project(camera); return [(v.x * .5 + .5) * r.width + r.left, (-v.y * .5 + .5) * r.height + r.top]; });
      const pad = 8;
      Object.assign(node.style, { left: pts[0][0] - pad + 'px', top: pts[0][1] - pad + 'px', width: pts[1][0] - pts[0][0] + pad * 2 + 'px', height: pts[1][1] - pts[0][1] + pad * 2 + 'px' });
    }
  }
  function pressAnchor(kind, on) {
    const a = anchorBoxes.find(b => b.kind === kind); if (!a) return;
    a.mesh.material.color.setScalar(on ? .55 : 1); a.mesh.scale.setScalar(on ? .97 : 1); needs = true;
  }
  function leafCanvas() {
    const c = cnv(128, 128), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 128, 128); g.addColorStop(0, '#2f5d2a'); g.addColorStop(.55, '#3f7a35'); g.addColorStop(1, '#5c9a45');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const hh = hash2(12); for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${hh(i, 1) > .5 ? '190,220,120' : '10,40,15'},${hh(i, 2) * .1})`; x.fillRect(hh(i, 3) * 128, hh(i, 4) * 128, 3, 3); }
    x.strokeStyle = 'rgba(205,228,150,.75)'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(64, 94); x.lineTo(64, 2); x.stroke();   // midrib
    x.lineWidth = 1; x.strokeStyle = 'rgba(205,228,150,.4)';
    for (let i = 0; i < 6; i++) { const y = 84 - i * 13; for (const sg of [-1, 1]) { x.beginPath(); x.moveTo(64, y); x.quadraticCurveTo(64 + sg * 22, y - 4, 64 + sg * (44 - i * 4), y + 6 - i); x.stroke(); } }
    return c;
  }
  function buildVine() {
    const g = new THREE.Group(), rnd = hash2(91);
    const sh = new THREE.Shape(); sh.moveTo(0, -1); sh.bezierCurveTo(.75, -.55, .95, .25, .5, .62); sh.bezierCurveTo(.25, .82, .05, .6, 0, .42); sh.bezierCurveTo(-.05, .6, -.25, .82, -.5, .62); sh.bezierCurveTo(-.95, .25, -.75, -.55, 0, -1);
    const lg = new THREE.ShapeGeometry(sh, 10), pos = lg.attributes.position, uv = lg.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const X = pos.getX(i), Y = pos.getY(i); uv.setXY(i, (X + 1) / 2, (Y + 1) / 2); pos.setZ(i, -Math.abs(X) * .28 - (Y + 1) * (Y + 1) * .05); pos.setY(i, Y - .42); }
    lg.computeVertexNormals();
    const lt = tex(leafCanvas());
    const mats = ['#ffffff', '#d9efc0', '#b8d69a'].map(c => new THREE.MeshStandardMaterial({ map: lt, color: c, side: THREE.DoubleSide, roughness: .5 }));
    const stemMat = new THREE.MeshStandardMaterial({ color: '#4a5a2a', roughness: .7 });
    const x0 = -visW / 2 + .9;
    [[0, 21, 2.6, -1], [.8, 12, 3.2, -1], [2.0, 5, 2.9, -1], [.1, 10, 2.7, 1], [1.1, 4.5, 3.1, 1]].forEach(([dx, len, z, sg], si) => {
      const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(sg * (visW / 2 - .9 - dx) + Math.sin(t * 5 + si * 2) * .35 + sg * t * .25, H + 2.5 - t * len, z + Math.sin(t * 3 + si) * .5)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .075, 5), stemMat); tube.castShadow = true; g.add(tube);
      const n = Math.round(len / 2.3);
      for (let k = 0; k < n; k++) {
        const t = (k + .6) / n, pt = curve.getPoint(Math.min(1, t)), sd = k % 2 ? 1 : -1;
        const leaf = new THREE.Mesh(lg, mats[(k + si) % 3]);
        const sc = (1.15 + rnd(k, si) * .55) * (1 - t * .3);
        leaf.scale.setScalar(sc); leaf.position.copy(pt).add(new THREE.Vector3(sd * .12, 0, .2 + rnd(k, si + 9) * .5));
        leaf.rotation.set(-.25 + rnd(k, si + 3) * .5, sd * (.15 + rnd(k, si + 5) * .5), sd * (.35 + rnd(k, si + 7) * .75));
        leaf.castShadow = leaf.receiveShadow = true; g.add(leaf);
      }
    });
    return g;
  }
  function applyLamps() {
    lampObjs.forEach(o => o.visible = lamps); lampPucks.forEach(m => m.emissiveIntensity = lamps ? 3 : 0);
    key.intensity = lamps ? 1.5 : 3.0; fill.intensity = lamps ? .22 : .32; rake.intensity = lamps ? .1 : .35; hemi.intensity = lamps ? .04 : .12;
    scene.environmentIntensity = (envLoaded ? .6 : .45) * (lamps ? .55 : 1); needs = true;
  }
  let woodSeed = 0;
  function boardMat(lenU, depthU, axis = 0) { return woodMaterial(axis, ++woodSeed, 0, .8); }
  function buildCase() {
    caseGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => { if (m === ironMat || m === brassEdge) return; m.map && m.map.dispose?.(); m.dispose(); }); } });
    caseGroup.clear();
    const d = camera.position.z; const backScale = (d + DEPTH) / d;
    const W = visW * backScale + 8, BH = H * backScale + 20;
    // back panel
    woodSeed = 0;
    const bm = woodMaterial(0, 77, 0, .66);   // tongue-and-groove back, grain running up
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, BH), bm); back.position.set(0, H / 2, -DEPTH); back.receiveShadow = true; caseGroup.add(back);
    // soft occlusion in each compartment
    const aoTex = tex(aoCanvas(), false);
    for (let j = 0; j < 3; j++) {
      const base = PL + BT + j * (HC + BT);
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(visW * ((camera.position.z + DEPTH) / camera.position.z), HC), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }));
      ao.position.set(0, base + HC / 2, -DEPTH + .05); caseGroup.add(ao);
    }
    // boards
    const bw = W;
    const boardYs = [PL + BT / 2]; for (let j = 1; j <= 3; j++) boardYs.push(PL + BT + j * (HC + BT) - BT / 2);
    boardYs.forEach((y, j) => {
      const isTop = j === 3; const thick = isTop ? BT * 2.2 : BT;
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, thick, DEPTH + 1), boardMat(bw, DEPTH));
      m.position.set(0, isTop ? y + thick / 2 - BT / 2 : y, -DEPTH / 2 + .5); m.castShadow = m.receiveShadow = true; caseGroup.add(m);
      // a slightly rounded lip on the front edge
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(thick / 2, thick / 2, bw, 16, 1, true), boardMat(bw, 4, 1));
      lip.rotation.z = Math.PI / 2; lip.scale.set(1, 1, .35); lip.position.set(0, m.position.y, 1); lip.receiveShadow = true; caseGroup.add(lip);
    });
    // side frame, like a real case
    const POST = 1.2;
    [-1, 1].forEach(sgn => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(POST, H + 10, DEPTH + 2), boardMat(H, DEPTH, 1));
       
      post.material.envMapIntensity = .02; post.material.clearcoat = 0; post.material.specularIntensity = .06;
      post.position.set(sgn * (visW / 2 - POST / 2), H / 2, -DEPTH / 2 + .9); post.castShadow = post.receiveShadow = true; caseGroup.add(post);
    });
    // carved buttons in the base
    anchorBoxes.length = 0;
    const carveW = 4.0;
    [].forEach(([kind, icon, sgn, slot]) => {
      const mp = carveMaps(icon, '');
      const nm = new THREE.CanvasTexture(mp.normal); nm.colorSpace = THREE.NoColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex(mp.color), normalMap: nm, normalScale: new THREE.Vector2(1.4, 1.4), transparent: true, roughness: .7, depthWrite: false });
      const ch = carveW * mp.aspect, cxp = sgn * (visW / 2 - 1.2 - 1.6 - carveW / 2 - slot * (carveW + 1.1)), cyp = PL / 2 + .35;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(carveW, ch), mat); q.position.set(cxp, cyp, .32); q.renderOrder = 3; caseGroup.add(q);
      anchorBoxes.push({ kind, mesh: q, x: cxp, y: cyp, w: carveW, h: ch });
    });
    // (the carved name was removed)
    if (false) {
      const mp = carveMaps('word', 'Bookkeeper');
      const nm = new THREE.CanvasTexture(mp.normal); nm.colorSpace = THREE.NoColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex(mp.color), normalMap: nm, normalScale: new THREE.Vector2(1.3, 1.3), transparent: true, roughness: .42, metalness: .65, depthWrite: false });
      const ww = Math.min(14, visW * .36), wh = ww * mp.aspect, wide = visW > 70;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), mat); q.position.set(wide ? 0 : -visW / 2 + 1.2 + 1.3 + ww / 2, PL / 2 + .1, .32); q.renderOrder = 3; caseGroup.add(q);
    }
    // plinth
    const pm = new THREE.Mesh(new THREE.BoxGeometry(bw, PL, 3), boardMat(bw, 10)); 
    pm.position.set(0, PL / 2, -1.2); pm.receiveShadow = true; caseGroup.add(pm);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(bw, 80), new THREE.MeshStandardMaterial({ color: '#3a2414', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 20); caseGroup.add(floor);
    // brass label plates
    ROWS.forEach((st, j) => {
      const y = PL + BT / 2 + j * (HC + BT);
      const n = books.filter(b => (b.status || 'reading') === st).length;
      const mp = brassMaps(`${LABEL[st]} · ${String(n).padStart(2, '0')}`);
      const nm = new THREE.CanvasTexture(mp.normal); nm.colorSpace = THREE.NoColorSpace; nm.anisotropy = aniso;
      const rm = new THREE.CanvasTexture(mp.rough); rm.colorSpace = THREE.NoColorSpace;
      const mat = new THREE.MeshPhysicalMaterial({ map: tex(mp.color), normalMap: nm, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: rm, roughness: 1, metalness: 1, clearcoat: .25, clearcoatRoughness: .35, envMapIntensity: 1.6 });
      const pw = 10.4, ph = pw * 200 / 1024;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, .12), [brassEdge, brassEdge, brassEdge, brassEdge, mat, brassEdge]);
      plate.position.set(0, y, 1.48); plate.castShadow = true; caseGroup.add(plate);
    });
    caseGroup.add(buildVine());
    // downlights under each shelf
    lampObjs.length = 0; lampPucks.length = 0;
    const pc = cnv(256, 256), px = pc.getContext('2d'); px.fillStyle = '#000'; px.fillRect(0, 0, 256, 256);
    px.save(); px.translate(128, 0); px.scale(.5, 1); const pg = px.createRadialGradient(0, -6, 4, 0, -6, 235);
    pg.addColorStop(0, 'rgba(255,236,200,1)'); pg.addColorStop(.12, 'rgba(255,214,150,.75)'); pg.addColorStop(.5, 'rgba(255,180,100,.2)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
    px.fillStyle = pg; px.fillRect(-256, 0, 512, 256); px.restore();
    const nL = Math.max(2, Math.round(visW / 10)), poolTex = tex(pc, true, 1); poolTex.wrapS = THREE.RepeatWrapping; poolTex.repeat.set(nL, 1);
    const puckMat = new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: .6, roughness: .4, emissive: '#ffd9a0', emissiveIntensity: 0 }); lampPucks.push(puckMat);
    for (let j = 0; j < 3; j++) {
      const base = PL + BT + j * (HC + BT);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(visW * backScale, HC), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .8 }));
      pool.position.set(0, base + HC / 2, -DEPTH + .12); pool.renderOrder = 1; caseGroup.add(pool); lampObjs.push(pool);
      for (let i = 0; i < nL; i++) {
        const lx = (-.5 + (i + .5) / nL) * visW * backScale;   // directly above its pool of light on the back panel
        const puck = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .22, 20), puckMat); puck.position.set(lx, base + HC - .11, -DEPTH + 1.3); caseGroup.add(puck);
      }
      for (const sx of [-.27, .27]) { const pl = new THREE.PointLight(0xffc98a, 520, 70, 1.8); pl.position.set(sx * visW, base + HC - 2, -5); caseGroup.add(pl); lampObjs.push(pl); }
    }
    applyLamps();
    // light
    key.position.set(-visW * .15 - 4, H + 95, 150); key.target.position.set(0, H / 2, -DEPTH / 2);
    const sc = key.shadow.camera; const R = Math.max(W, H) * .9 + 40; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
  }

  function dimsOf(b) {
    const h = hashStr(b.id), r = n => ((h >>> n) & 1023) / 1023;
    // format: mass-market paperback, trade paperback, hardback, tall art/large-format
    const f = r(3); const base = f < .2 ? 18.2 : f < .62 ? 20.4 : f < .9 ? 22.4 : 23.6;
    const ht = Math.min(HC - 1.1, base + (r(7) - .5) * 1.2);
    const pages = b.pages || (140 + Math.round(r(11) * 420));
    const paper = f < .2 ? .0058 : .0068;                     // thicker stock on hardbacks
    const t = Math.max(1.6, Math.min(7.2, (.35 + pages * paper + (f >= .62 ? .5 : 0)) * 1.3));
    return { h: ht, t, d: ht * (f < .2 ? .62 : .67), hard: f >= .62 };
  }
  // ---- real images: covers from Open Library etc., spines from the cover or a photo ----
  const imgCache = new Map();
  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (imgCache.has(url)) return imgCache.get(url);
    const urls = coverSrc(url);
    const p = new Promise(res => {
      const tryOne = i => {
        if (i >= urls.length) return res(null);
        const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
        im.onload = () => (im.naturalWidth > 20 ? res(im) : tryOne(i + 1)); im.onerror = () => tryOne(i + 1); im.src = urls[i];
      };
      tryOne(0);
    });
    imgCache.set(url, p); return p;
  }
  function avgColor(img, sx, sw) {
    const c = cnv(1, 8), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, 1, 8);
    const d = x.getImageData(0, 0, 1, 8).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return [r / 8, g / 8, b / 8];
  }
  function spineShading(x, w, h) {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(.06, 'rgba(0,0,0,.04)'); g.addColorStop(.94, 'rgba(0,0,0,.06)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // a touch of shelf wear at head and tail
    const e = x.createLinearGradient(0, 0, 0, h); e.addColorStop(0, 'rgba(0,0,0,.18)'); e.addColorStop(.02, 'rgba(0,0,0,0)'); e.addColorStop(.98, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,.22)');
    x.fillStyle = e; x.fillRect(0, 0, w, h);
  }
  function spineFromPhoto(dims, img) {
    const w = Math.max(48, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
    const c = cnv(w, h), x = c.getContext('2d');
    // the photo may be landscape or portrait — rotate so the long side runs down the spine
    const land = img.naturalWidth > img.naturalHeight;
    x.save();
    if (land) { x.translate(w, 0); x.rotate(Math.PI / 2); }
    const W = land ? h : w, Hh = land ? w : h;
    x.drawImage(img, 0, 0, W, Hh);   // show the whole spine, stretched to this book's shape
    x.restore(); if (dims.hard) hinges(x, w, h); spineShading(x, w, h); return c;
  }
  function coverColours(img) {
    const iw = img.naturalWidth;
    const edge = avgColor(img, 0, Math.max(2, Math.round(iw * .12)));            // what wraps round to the spine
    const mid = avgColor(img, Math.round(iw * .3), Math.round(iw * .4));
    return { edge, mid };
  }
  const rgbStr = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  function spineFromCover(b, dims, col, img) {
    const w = Math.max(48, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
    const c = cnv(w, h), x = c.getContext('2d');
    const { edge, mid } = coverColours(img);
    x.fillStyle = rgbStr(edge); x.fillRect(0, 0, w, h);
    speckle(x, w, h, hashStr(b.id), .8);
    const light = (0.2126 * edge[0] + 0.7152 * edge[1] + 0.0722 * edge[2]) / 255 > .55;
    const ink = light ? '#1d1a16' : '#f6efe2';
    const dist = Math.hypot(edge[0] - mid[0], edge[1] - mid[1], edge[2] - mid[2]);
    const acc = dist > 60 ? rgbStr(mid) : (light ? '#7a2b22' : '#e2c27a');
    typeSpine(x, w, h, b, styleOf(b, w), ink, acc);
    wear(x, w, h, b, dims);
    if (dims.hard) hinges(x, w, h);
    spineShading(x, w, h); return c;
  }
  function spineTex(b, dims, col) {
    const k = [b.id, b.title, b.author, col.bg, col.acc, b.coverUrl || '', b.spineUrl || '', dims.t.toFixed(2), dims.h.toFixed(2)].join('|');
    if (texCache.has(k)) return texCache.get(k);
    const t = tex(spineCanvas(b, dims, col)); texCache.set(k, t);
    (async () => {
      const sp = await loadImage(b.spineUrl);
      if (sp) { t.image = spineFromPhoto(dims, sp); t.dispose(); t.needsUpdate = true; needs = true; return; }
      const cv = await loadImage(b.coverUrl);
      if (cv) { try { t.image = spineFromCover(b, dims, col, cv); t.dispose(); t.needsUpdate = true; needs = true; } catch { /* image not readable */ } }
    })();
    return t;
  }
  function coverTex(b, col) {
    const k = b.id + '|' + (b.coverUrl || '') + '|' + col.bg;
    if (coverCache.has(k)) return coverCache.get(k);
    const t = tex(coverCanvas(b, col)); coverCache.set(k, t);
    loadImage(b.coverUrl).then(img => { if (img) { t.image = img; t.dispose(); t.needsUpdate = true; needs = true; } });
    return t;
  }
  function curvedPanel(w, h, bulge) {
    const g = new THREE.PlaneGeometry(w, h, 14, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = 2 * p.getX(i) / w; p.setZ(i, bulge * (1 - u * u)); }
    g.computeVertexNormals(); return g;
  }
  function bookMesh(b, dims) {
    const c = colorsOf(b), col = { ...c, lumDark: c.fg !== '#1d1a16' };
    const hv = hashStr(b.id), jacket = hv % 3 !== 0;
    const sideCol = new THREE.Color(shade(col.bg, .92));
    const board = new THREE.MeshStandardMaterial({ color: sideCol, roughness: jacket ? .55 : .8, bumpMap: clothTex, bumpScale: jacket ? .15 : .5 });
    const boardEdge = new THREE.MeshStandardMaterial({ color: sideCol.clone().multiplyScalar(.82), roughness: .85 });
    const spine = jacket
      ? new THREE.MeshPhysicalMaterial({ map: spineTex(b, dims, col), normalMap: spineNormal, normalScale: new THREE.Vector2(dims.hard ? .3 : .55, 1), roughness: .5, clearcoat: .35, clearcoatRoughness: .45 })
      : new THREE.MeshStandardMaterial({ map: spineTex(b, dims, col), normalMap: spineNormal, normalScale: new THREE.Vector2(dims.hard ? .3 : .5, .9), roughness: .86, bumpMap: clothTex, bumpScale: .35 });
    // the sides take the colour of the cover's edge once the real cover arrives
    if (b.coverUrl && !b.spineUrl) loadImage(b.coverUrl).then(img => {
      if (!img) return;
      try { const e = coverColours(img).edge; const k = new THREE.Color(rgbStr(e)); k.convertSRGBToLinear(); board.color.copy(k).multiplyScalar(.92); boardEdge.color.copy(k).multiplyScalar(.75); needs = true; } catch { }
    });
    const g = new THREE.Group(); g.userData.id = b.id;
    const add = (geo, mats, x, y, z) => { geoms.push(geo); const m = new THREE.Mesh(geo, mats); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; m.userData.id = b.id; g.add(m); return m; };
    const { t, h, d } = dims;
    if (dims.hard) {
      // hardback: two boards, a spine, and a page block set in by the "squares"
      const BT = Math.min(.2, t * .09), SQ = .24, SP = .34;
      // a rounded spine that bulges out past the boards, the way a cased book's does
      const bulge = Math.min(.42, t * .11), spF = d / 2 - bulge;      // front plane of the spine block
      const bdF = spF - SP * .5, bdD = bdF + d / 2;                   // boards tuck into the spine block
      const pgF = spF - SP * .6, pd = pgF + d / 2 - SQ, pw = t - 2 * BT - .02, ph = h - 2 * SQ;
      add(new THREE.BoxGeometry(pw, ph, pd), [pagesMat, pagesMat, pagesMat, pagesMat, pagesMat, pagesMat], 0, 0, pgF - pd / 2);
      for (const sgn of [-1, 1]) { const bm = add(new THREE.BoxGeometry(BT, h, bdD), [board, board, boardEdge, boardEdge, boardEdge, boardEdge], sgn * (t / 2 - BT / 2), 0, bdF - bdD / 2); if (sgn > 0) g.userData.front = bm; }
      add(new THREE.BoxGeometry(t, h, SP), [boardEdge, boardEdge, boardEdge, boardEdge, boardEdge, boardEdge], 0, 0, d / 2 - SP / 2 - bulge);
      add(curvedPanel(t, h, bulge), spine, 0, 0, d / 2 - bulge);
      g.userData.front_z = d / 2;
    } else {
      // paperback: flush cut, thin card cover, page edges showing at head and tail
      const CT = .07;
      add(new THREE.BoxGeometry(t - 2 * CT, h - .02, d - CT), [pagesMat, pagesMat, pagesMat, pagesMat, pagesMat, pagesMat], 0, 0, -CT / 2);
      for (const sgn of [-1, 1]) { const bm = add(new THREE.BoxGeometry(CT, h, d), [board, board, boardEdge, boardEdge, boardEdge, boardEdge], sgn * (t / 2 - CT / 2), 0, 0); if (sgn > 0) g.userData.front = bm; }
      g.userData.front_z = d / 2;
      add(new THREE.BoxGeometry(t, h, CT), [boardEdge, boardEdge, boardEdge, boardEdge, spine, boardEdge], 0, 0, d / 2 - CT / 2);
    }
    g.userData.book = b; g.userData.col = col; g.userData.boardMat = board; g.userData.dims = dims;
    return g;
  }
  function buildBooks() {
    const shared = new Set([pagesMat, edgeAOMat, floorAOMat, ironMat]);
    booksGroup.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => !shared.has(m) && m.dispose()); });
    geoms.forEach(g => g.dispose()); geoms.length = 0; booksGroup.clear();
    rows = ROWS.map((st, j) => {
      const base = PL + BT + j * (HC + BT);
      const list = books.filter(b => (b.status || 'reading') === st);
      if (st === 'finished') list.sort((a, b) => (b.finished || '').localeCompare(a.finished || ''));
      else if (st === 'reading') list.sort((a, b) => (b.started || '').localeCompare(a.started || ''));
      else list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const g = new THREE.Group(); booksGroup.add(g);
      const left = -visW / 2 + 1.2 + .35 + (st === 'reading' ? 3.4 : 0); let x = left; const items = [];
      // a small pile lying flat at the end of fuller shelves
      const nStack = st !== 'reading' && list.length >= 6 ? (list.length >= 10 ? 3 : 2) : 0;
      const standing = list.slice(0, list.length - nStack), stacked = list.slice(list.length - nStack);
      const sDims = standing.map(dimsOf);
      standing.forEach((b, i) => {
        const dims = sDims[i], mesh = bookMesh(b, dims), pivot = new THREE.Group();
        const hv = hashStr(b.id);
        mesh.position.set(dims.t / 2, dims.h / 2, 0);
        pivot.add(mesh);
        pivot.position.set(x, base, -1.4 - dims.d / 2 - ((hv >>> 4) % 10) * .09);
        pivot.rotation.y = ((hv % 5) - 2) * .01;
        // contact shading where this book meets its neighbours
        const zf = mesh.userData.front_z + .02, aw = Math.min(.55, dims.t * .3), aos = [];
        [[-1, sDims[i - 1]], [1, sDims[i + 1]]].forEach(([sg, nb]) => {
          const ah = nb ? Math.min(dims.h, nb.h) : dims.h * .35;
          const q = new THREE.Mesh(new THREE.PlaneGeometry(aw, ah), edgeAOMat); geoms.push(q.geometry);
          q.position.set(sg * (dims.t / 2 - aw / 2), -dims.h / 2 + ah / 2, zf); if (sg > 0) q.scale.x = -1;
          q.renderOrder = 2; mesh.add(q); aos.push(q);
        });
        mesh.userData.aos = aos;
        x += dims.t + .02 + (hv % 9 === 0 ? .1 : 0);
        pivot.userData = { id: b.id, home: pivot.position.clone(), rot: pivot.rotation.clone(), d: dims.d };
        g.add(pivot); items.push(pivot);
      });
      const standW = x - left;
      // shadow pooled on the shelf in front of the books
      if (standing.length) {
        const fs = new THREE.Mesh(new THREE.PlaneGeometry(standW + .4, 2.8), floorAOMat); geoms.push(fs.geometry);
        fs.rotation.x = -Math.PI / 2; fs.position.set(left + standW / 2, base + .02, -1.45 + 1.4 - .2);
        fs.renderOrder = 1; g.add(fs);
      }
      const stackW = stacked.length ? Math.max(...stacked.map(b => dimsOf(b).h)) + .8 : 0;
      // no bookends: when there is room, the last standing book leans on its neighbour
      const willLean = standing.length > 1 && standW + stackW + 9 < visW - 4;
      if (willLean && stacked.length) x += sDims[standing.length - 1].h * Math.sin(.2) + .6;
      // the pile
      if (stacked.length) {
        x += .5; let yAcc = 0;
        stacked.map(b => [b, dimsOf(b)]).sort((a, b2) => b2[1].h - a[1].h).forEach(([b, dims], k) => {
          const mesh = bookMesh(b, dims), pivot = new THREE.Group(), hv = hashStr(b.id);
          mesh.rotation.z = Math.PI / 2; mesh.position.set(dims.h / 2, dims.t / 2, 0); pivot.add(mesh);
          pivot.position.set(x + ((hv % 7) - 3) * .12, base + yAcc, -1.4 - dims.d / 2 - (hv % 4) * .1);
          pivot.rotation.y = ((hv % 5) - 2) * .02;
          pivot.userData = { id: b.id, home: pivot.position.clone(), rot: pivot.rotation.clone(), flat: true, d: dims.d };
          yAcc += dims.t + .01; g.add(pivot); items.push(pivot);
        });
        x += stackW;
      }
      const contentW = x - left;
      // lean the last book if there is room
      if (willLean) {
        const p = items[standing.length - 1], m = p.children[0], dims = sDims[standing.length - 1];
        const prev = items[standing.length - 2]; const prevRight = prev.position.x + sDims[standing.length - 2].t;
        const a = .2; m.position.x = -dims.t / 2;
        p.position.x = prevRight + dims.h * Math.sin(a) + dims.t * Math.cos(a) - .15; p.rotation.z = a;
        p.userData.home = p.position.clone(); p.userData.rot = p.rotation.clone();
      }
      const row = { st, group: g, items, base, contentW, offset: 0, vel: 0 };
      row.min = Math.min(0, visW - 3.7 - contentW); return row;
    });
    needs = true;
  }

  /* ---------- interaction ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const toNDC = e => { const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
  function rowAt(e) {
    toNDC(e); ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 4), p);
    return rows.find(r => p.y >= r.base - BT && p.y < r.base + HC);
  }
  let drag = null;
  const pxToWorld = () => visW / el.clientWidth;
  el.addEventListener('pointerdown', e => {
    if (pulled) { drag = { dismiss: true }; return; }
    const row = rowAt(e); drag = { x: e.clientX, y: e.clientY, t: e.timeStamp, row, last: e.clientX, lt: performance.now(), moved: false };
    if (row) row.vel = 0;
  });
  el.addEventListener('pointermove', e => {
    if (!drag || drag.dismiss) return; const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(e.clientY - drag.y)) { drag.moved = true; try { el.setPointerCapture(e.pointerId) } catch { } }
    if (drag.moved && drag.row) {
      const now = performance.now(), step = (e.clientX - drag.last) * pxToWorld();
      setOffset(drag.row, drag.row.offset + step, true);
      drag.row.vel = step / Math.max(1, now - drag.lt) * 16; drag.last = e.clientX; drag.lt = now;
    }
  });
  const end = e => {
    if (!drag) return; const d = drag; drag = null;
    if (d.dismiss) { if (e.type === 'pointerup') onDismiss?.(); return; }
    if (!d.moved && e.timeStamp - d.t < 450 && e.type === 'pointerup') pick(e);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; const r = rowAt(e); if (!r) return; e.preventDefault(); setOffset(r, r.offset - e.deltaX * pxToWorld()) }, { passive: false });
  function setOffset(r, v, elastic) {
    const lo = r.min, hi = 0;
    if (elastic) { if (v > hi) v = hi + (v - hi) * .35; if (v < lo) v = lo + (v - lo) * .35; } else v = Math.max(lo, Math.min(hi, v));
    r.offset = v; r.group.position.x = v; needs = true;
  }
  let pulled = null;
  function showCover(m, on) {
    const fb = m.userData.front; if (!fb) return;
    if (on) {
      if (!m.userData.coverMat) m.userData.coverMat = new THREE.MeshStandardMaterial({ map: coverTex(m.userData.book, m.userData.col), roughness: .55 });
      fb.material = fb.material.slice(); fb.material[0] = m.userData.coverMat;
    } else { fb.material = fb.material.slice(); fb.material[0] = m.userData.boardMat; }
    (m.userData.aos || []).forEach(q => q.visible = !on);
  }
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x0a0603, transparent: true, opacity: 0, depthWrite: false }));
  dim.position.z = 14; dim.renderOrder = 10; dim.visible = false; scene.add(dim);
  const findPivot = id => { for (const r of rows) for (const p of r.items) if (p.userData.id === id) return p; return null; };
  const cancel = (...objs) => { for (let i = tweens.length - 1; i >= 0; i--) if (objs.includes(tweens[i].obj)) tweens.splice(i, 1); };
  const outZ = p => p.userData.home.z + (p.userData.d || 14) * .55 + 4;
  function heroTarget(p) {
    const m = p.children[0], dm = m.userData.dims, d = camera.position.z;
    const k = Math.min(1.75, Math.max(1.15, .29 * H / dm.h));          // how much nearer the camera
    const row = rows.find(r => r.items.includes(p));
    const yc = camera.position.y;
    return { x: -(row ? row.group.position.x : 0) - m.position.x, y: yc + (.80 * H - yc) / k - m.position.y, z: d * (1 - 1 / k) };
  }
  // The book leaves the shelf, turns its cover to you and rises to the top of the screen.
  function toHero(p, instant, delay = 0) {
    const m = p.children[0], t = heroTarget(p);
    showCover(m, true); m.traverse(o => { if (o.isMesh) o.castShadow = false; }); dim.visible = true;
    const go = (o, k, v, dur) => { if (instant) o[k] = v; else tween(o, k, v, dur, delay); };
    go(p.position, 'x', t.x, 560); go(p.position, 'y', t.y, 560); go(p.position, 'z', t.z, 560);
    go(m.rotation, 'y', -Math.PI / 2 + .2, 520); go(m.rotation, 'z', 0, 420);
    go(p.rotation, 'z', 0, 420); go(p.rotation, 'y', 0, 420);
    go(dim.material, 'opacity', .58, 520);
    needs = true;
  }
  function pick(e) {
    scene.updateMatrixWorld(); toNDC(e); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(booksGroup.children, true)[0]; if (!hit) return;
    let p = hit.object; while (p && !p.userData?.home) p = p.parent; if (!p) return;
    pushBack(); pulled = p;
    cancel(p.position, p.rotation, p.children[0].rotation, dim.material);
    tween(p.position, 'z', outZ(p), 240);                               // 1. slide out of the row
    tween(p.position, 'y', p.userData.home.y + (p.userData.flat ? 1.6 : .6), 240);
    toHero(p, false, 200);                                              // 2. turn and rise
    setTimeout(() => { if (pulled === p) onPick(p.userData.id); }, 520); // 3. the sheet comes up to meet it
  }
  function focus(id) {
    if (pulled && pulled.userData.id === id) return;
    const p = findPivot(id); if (!p) return;
    pushBack(); pulled = p; cancel(p.position, p.rotation, p.children[0].rotation, dim.material); toHero(p, false);
  }
  function pushBack() {
    if (!pulled) return; const p = pulled; pulled = null; const m = p.children[0], h = p.userData.home, r0 = p.userData.rot;
    cancel(p.position, p.rotation, m.rotation, dim.material);
    tween(p.position, 'x', h.x, 420); tween(p.position, 'y', h.y + .6, 420); tween(p.position, 'z', outZ(p), 420);
    tween(m.rotation, 'y', 0, 400); tween(m.rotation, 'z', p.userData.flat ? Math.PI / 2 : 0, 400);
    tween(p.rotation, 'z', r0.z, 400); tween(p.rotation, 'y', r0.y, 400);
    tween(dim.material, 'opacity', 0, 380);
    tween(p.position, 'z', h.z, 300, 400); tween(p.position, 'y', h.y, 300, 400);
    setTimeout(() => { if (pulled !== p) { showCover(m, false); m.traverse(o => { if (o.isMesh && o.material !== edgeAOMat) o.castShadow = true; }); needs = true; } if (!pulled) dim.visible = false; }, 740);
  }
  function tween(obj, prop, to, dur, delay = 0) {
    tweens.push({ obj, prop, from: null, to, dur, start: performance.now() + delay });
  }

  function loop() {
    if (disposed) return; raf = requestAnimationFrame(loop);
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i]; if (t.dead) { tweens.splice(i, 1); continue; } if (now < t.start) { needs = true; continue; }
      if (t.from === null) { for (const o of tweens) if (o !== t && o.obj === t.obj && o.prop === t.prop && o.from !== null) o.dead = true; t.from = t.obj[t.prop]; }
      const k = Math.min(1, (now - t.start) / t.dur), e = 1 - Math.pow(1 - k, 3);
      t.obj[t.prop] = t.from + (t.to - t.from) * e; needs = true; if (k >= 1) tweens.splice(i, 1);
    }
    if (!drag || !drag.moved) for (const r of rows) {
      if (Math.abs(r.vel) > .002) { r.vel *= .93; setOffset(r, r.offset + r.vel, true); }
      else r.vel = 0;
      if (r.offset > 0 || r.offset < r.min) { const target = r.offset > 0 ? 0 : r.min; r.offset += (target - r.offset) * .18; if (Math.abs(target - r.offset) < .01) r.offset = target; r.group.position.x = r.offset; r.vel *= .5; needs = true; }
    }
    if (needs && !paused) { renderer.render(scene, camera); needs = false; }
  }

  function rebuild() {
    const pid = pulled?.userData.id, offs = rows.map(r => r.offset);
    tweens.length = 0; pulled = null;
    buildCase(); buildBooks(); placeAnchors();
    rows.forEach((r, i) => setOffset(r, offs[i] ?? 0));
    const p = pid && findPivot(pid);
    if (p) { pulled = p; toHero(p, true); } else { dim.material.opacity = 0; dim.visible = false; }
    needs = true;
  }
  const ro = new ResizeObserver(() => { if (frame()) rebuild(); });
  ro.observe(el);
  frame(); buildCase(); buildBooks(); placeAnchors();
  await Promise.race([envReady, new Promise(r => setTimeout(r, 2500))]);
  renderer.render(scene, camera); loop();

  return {
    el,
    update(nextBooks, nextView) {
      books = nextBooks.slice(); view = nextView; rebuild();
    },
    pushBack, focus,
    setLamps(v) { lamps = !!v; applyLamps(); },
    setAnchors(a) { anchors = a; placeAnchors(); },
    press: pressAnchor,
    pause(v) { paused = v; if (!v) needs = true; },
    destroy() { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
