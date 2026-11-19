/* Bookie — the 3D bookcase.
   Three shelves fill one screen. Each shelf swipes sideways; tap a book to pull it out. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// a box with softly rounded edges; keeps per-face materials
const RBox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.max(.004, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001)));

const BT = 2.0;      // board thickness
const HC = 25;       // clear height of a compartment
let PL = 11;         // plinth height: grown at run time so the floating bar sits clear of the bottom shelf
const DEPTH = 26;    // shelf depth
let H = PL + BT + 3 * (HC + BT);
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
function aoCanvas() {   // back of a compartment: dark under the shelf above, into both corners, and a little at the bottom
  const w = 256, h = 256, c = cnv(w, h), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(35,18,5,.78)'); g.addColorStop(.12, 'rgba(35,18,5,.36)'); g.addColorStop(.4, 'rgba(0,0,0,0)'); g.addColorStop(.75, 'rgba(30,15,5,0)'); g.addColorStop(.93, 'rgba(30,15,5,.16)'); g.addColorStop(1, 'rgba(30,15,5,.34)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(30,15,5,.62)'); g.addColorStop(.06, 'rgba(30,15,5,.3)'); g.addColorStop(.2, 'rgba(0,0,0,0)'); g.addColorStop(.8, 'rgba(0,0,0,0)'); g.addColorStop(.94, 'rgba(30,15,5,.3)'); g.addColorStop(1, 'rgba(30,15,5,.62)');
  x.fillStyle = g; x.fillRect(0, 0, w, h); return c;
}
function aoSideCanvas() {   // inside face of a side wall: darkest in the back corner, fading toward the front edge
  const w = 256, h = 128, c = cnv(w, h), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.45, 'rgba(30,15,5,.1)'); g.addColorStop(.85, 'rgba(30,15,5,.36)'); g.addColorStop(1, 'rgba(30,15,5,.55)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(30,15,5,.4)'); g.addColorStop(.18, 'rgba(0,0,0,0)');
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

const PPU = 64; // texture pixels per world unit (sharper small titles)
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
    x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(gx - 1, 0, 2, h);
    x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(gx + (gx < w / 2 ? 1 : -2), 0, 1, h);
  }
}
function wear(x, w, h, b, dims) {
  return;   // books keep their original colours: no fading, rubbing or creases
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
  amt *= .35;
  const hh = hash2(seed % 1000);
  for (let i = 0; i < w * h / 7; i++) { const a = hh(i, 3); x.fillStyle = a > .5 ? `rgba(255,255,255,${(a - .5) * .06 * amt})` : `rgba(0,0,0,${a * .07 * amt})`; x.fillRect(hh(i, 1) * w, hh(i, 2) * h, 1.3, 1.3); }
}
function spineCanvas(b, dims, col) {
  const w = Math.max(20, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
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
  const w = 300, h = 450, c = cnv(w * 2, h * 2), x = c.getContext('2d'); x.scale(2, 2);   // drawn at 2x for sharpness
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
  hx.font = '700 84px "IBM Plex Mono", ui-monospace, monospace'; if ('letterSpacing' in hx) hx.letterSpacing = '4px'; hx.textAlign = 'center'; hx.textBaseline = 'middle';
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
  const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e6c47a'); g.addColorStop(.5, '#cfa555'); g.addColorStop(1, '#b08838'); cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  const hh = hash2(41);
  for (let i = 0; i < 9000; i++) { const y = hh(i, 2) * h; cx.fillStyle = `rgba(${hh(i, 5) > .5 ? '255,236,190' : '90,62,20'},${hh(i, 1) * .1})`; cx.fillRect(hh(i, 3) * w, y, 30 + hh(i, 4) * 120, 1); }
  for (let i = 0; i < 6; i++) { const r = cx.createRadialGradient(hh(i, 9) * w, hh(i, 10) * h, 2, hh(i, 9) * w, hh(i, 10) * h, 60 + hh(i, 11) * 80); r.addColorStop(0, 'rgba(70,50,20,.12)'); r.addColorStop(1, 'rgba(70,50,20,0)'); cx.fillStyle = r; cx.fillRect(0, 0, w, h); }
  cx.font = hx.font; if ('letterSpacing' in cx) cx.letterSpacing = '4px'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillStyle = 'rgba(255,236,190,.55)'; cx.fillText(text, w / 2, h / 2 + 5);   // lit lower lip of the engraving
  cx.fillStyle = '#140c03'; cx.fillText(text, w / 2, h / 2 + 2);
  cx.strokeStyle = 'rgba(40,24,6,.85)'; cx.lineWidth = 7; cx.strokeRect(3.5, 3.5, w - 7, h - 7);
  for (const sxp of sx) { cx.strokeStyle = 'rgba(40,28,10,.85)'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(sxp - 11, h / 2 - 6); cx.lineTo(sxp + 11, h / 2 + 6); cx.stroke(); }
  // roughness: brushed metal, rougher in the grooves
  const R = cnv(w, h), rx = R.getContext('2d'); rx.fillStyle = 'rgb(80,80,80)'; rx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7000; i++) { const v = 50 + hh(i, 7) * 70; rx.fillStyle = `rgb(${v},${v},${v})`; rx.fillRect(hh(i, 3) * w, hh(i, 2) * h, 40 + hh(i, 6) * 160, 1); }
  rx.font = hx.font; if ('letterSpacing' in rx) rx.letterSpacing = '4px'; rx.textAlign = 'center'; rx.textBaseline = 'middle'; rx.fillStyle = 'rgb(220,220,220)'; rx.fillText(text, w / 2, h / 2 + 3);
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
float wfbm(vec3 p){ float a = 0., w = .5; for (int i = 0; i < 3; i++) { a += wn(p) * w; p = p * 2.03 + 7.1; w *= .5; } return a; }
// The board is cut from a virtual log: growth rings wrap an axis that runs along the grain.
void woodEval(vec3 P, out vec3 col, out float hgt, out float rgh){
  vec3 p = uAxis < .5 ? P.xyz : P.yxz;                 // p.x runs along the grain
  float seam = 1.;
  if (uPlank > 0.) {                                    // boards joined edge to edge, each from a different part of the tree
    float k = p.y / uPlank, id = floor(k), fk = fract(k);
    float sw = max(.014, fwidth(k) * 1.5);              // never sharper than a pixel
    seam = smoothstep(0., sw, fk) * smoothstep(1., 1. - sw, fk);
    p += vec3(wh13(vec3(id, 1., 2.)) * 90., 0., wh13(vec3(id, 5., 3.)) * 30. + id * 2.7);
  }
  p += uSeed;
  vec3 q = p;
  q.yz += (wfbm(vec3(p.x * .018, p.yz * .14)) - .5) * 1.3;         // the trunk is never straight
  q.yz += (wn(vec3(p.x * .1, p.yz * .9)) - .5) * .06;
  q.yz += (wfbm(vec3(p.x * .07, p.yz * .22)) - .5) * 1.1;         // grain meanders along the board, so no line runs straight
  float r = length(q.yz - vec2(2., -34.)) * 2.3;                   // wider rings: grain lines several pixels thick                   // distance from the pith
  // Anti-aliasing: every detail fades out once it's finer than a couple of screen pixels,
  // so the grain stays still instead of shimmering when the view shifts a fraction of a pixel.
  float fw = length(fwidth(p.yz)) * .55, rw = fwidth(r) * .55;   // baked: keep detail up to the texture's limit, mipmaps do the rest
  float aF = 1. - smoothstep(.12, .45, fw * 14.), aN = 1. - smoothstep(.12, .45, fw * 26.), aP = 1. - smoothstep(.08, .35, fw * 40.);
  float ring = fract(r), rid = floor(r);
  float yr = wh13(vec3(rid, 7., 3.));                              // every year grew differently
  float re = clamp(rw * 1.5, .04, .5);                              // ring edge softens to at least a pixel wide
  float late = smoothstep(.45, 1. - re, ring) * (1. - smoothstep(1. - re, 1., ring));
  late = mix(.36, late, 1. - smoothstep(.25, .6, rw));             // rings too tight to draw blend to their average   // darkens through the season, then starts again
  float fibre = mix(.5, wn(vec3(p.x * .6, p.yz * 14.)), aF);
  float fine = mix(.5, wn(vec3(p.x * 1.8, p.yz * 26.)), aN);
  float pore = smoothstep(.83, .92, wn(vec3(p.x * 1.4, p.yz * 24.))) * (1. - .6 * late) * aP;   // open pores, drawn out along the grain
  float streak = wfbm(vec3(p.x * .01, p.yz * .3));               // long heartwood streaks
  vec3 cE = vec3(.43, .27, .135), cL = vec3(.31, .185, .085), cW = vec3(.52, .35, .18), cG = vec3(.36, .26, .16);
  col = mix(cE, cL * .92, late * (.3 + .25 * yr));   // calm, low-contrast figure
  col *= .9 + yr * .2;
  col = mix(col, cG, smoothstep(.5, .8, streak) * .4);
  col = mix(col, cW, smoothstep(.5, .2, streak) * .35);
  col *= .97 + fibre * .06;                                         // hairline fibres kept faint: straight thin lines crawl on screens
  col *= 1. - fine * .03;
  col = mix(col, cL * .6, pore * .22);
                 // tiny pin knots, warm brown
  col *= mix(.18, 1., seam) * uTone;
  hgt = -late * .18 - pore * .22 + fibre * .06 - (1. - seam) * 2.5;
  rgh = .34 + late * .06 + pore * .12 - (fibre - .5) * .05 + (streak - .5) * .06;
}
`;
let WOOD_ENV = null;
// The grain is baked once into two mipmapped textures, so the GPU filters it like a photo:
// no shimmer or crawling at any size, angle or tilt.  A = faces looking across the log
// (fronts, back panel), B = faces looking down onto it (shelf tops, post sides).
const WB = { A: { u0: -64, lu: 128, v0: -85, lv: 170, w: 1024, h: 4096, c: 0 },
             B: { u0: -64, lu: 128, v0: -26, lv: 64, w: 1024, h: 1536, c: 1 } };
let WOOD_A = null, WOOD_B = null, WOOD_GRAIN = null, WOOD_SCRATCH = null;
function scratchTex(renderer) {   // fine, faint, everyday scuffs: short strokes at random angles, a few long ones
  const n = 1024, c = cnv(n, n), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, n, n);
  let z = 98765; const r = () => ((z = (z * 1103515245 + 12345) >>> 0) / 4294967296);
  x.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const long = r() < .12, len = long ? 120 + r() * 260 : 12 + r() * 60, a = r() * Math.PI, px = r() * n, py = r() * n;
    const bend = (r() - .5) * len * .25;
    x.strokeStyle = `rgba(255,255,255,${(long ? .45 : .7) * (.45 + r() * .55)})`; x.lineWidth = 2.2 + r() * 2.2;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {   // tile seamlessly
      const sx = px + ox, sy = py + oy, ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo((sx + ex) / 2 - Math.sin(a) * bend, (sy + ey) / 2 + Math.cos(a) * bend, ex, ey); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function grainTex(renderer) {   // tiling random specks, mipmapped so they average out instead of sparkling
  const n = 256, d = new Uint8Array(n * n * 4);
  let x = 1234567; const r = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < n * n; i++) { const v = Math.round(255 * Math.min(1, Math.max(0, .5 + (r() + r() - 1) * .75))); d.set([v, v, v, 255], i * 4); }
  const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true; return t;
}
function bakeWood(renderer) {
  if (WOOD_A) return;
  const cap = renderer.capabilities.maxTextureSize || 4096;
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uAxis: { value: 0 }, uSeed: { value: new THREE.Vector3() }, uPlank: { value: 0 }, uTone: { value: 1 },
                uRect: { value: new THREE.Vector4() }, uSlice: { value: 0 }, uMode: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vWoodP; void main(){ vUv = uv; vWoodP = vec3(0.); gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: WOOD_GLSL + `
      uniform vec4 uRect; uniform float uSlice; uniform float uMode; varying vec2 vUv;
      void main(){
        float u = uRect.x + vUv.x * uRect.y, v = uRect.z + vUv.y * uRect.w;
        vec3 P = uMode < .5 ? vec3(u, v, uSlice) : vec3(u, uSlice, v);
        vec3 col; float hgt; float rgh; woodEval(P, col, hgt, rgh);
        gl_FragColor = vec4(sqrt(clamp(col, 0., 1.)), clamp(hgt * 1.5 + .7, 0., 1.));
      }`,
    blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const out = [];
  for (const [mode, d] of [[0, WB.A], [1, WB.B]]) {
    const w = Math.min(d.w, cap), h = Math.min(d.h, cap);
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.MirroredRepeatWrapping, wrapT: THREE.MirroredRepeatWrapping });
    rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mat.uniforms.uRect.value.set(d.u0, d.lu, d.v0, d.lv); mat.uniforms.uSlice.value = d.c; mat.uniforms.uMode.value = mode;
    renderer.setRenderTarget(rt); renderer.render(scene, cam); out.push(rt.texture);
  }
  renderer.setRenderTarget(null); mat.dispose();
  [WOOD_A, WOOD_B] = out;
  WOOD_GRAIN = grainTex(renderer); WOOD_SCRATCH = scratchTex(renderer);
}
const WOOD_SAMPLE = /* glsl */`
uniform float uAxis; uniform vec3 uSeed; uniform float uTone;
uniform sampler2D uWoodA, uWoodB, uGrain, uScratch; uniform vec4 uRA, uRB;
varying vec3 vWoodP; varying vec3 vWoodN;
vec4 wTex(sampler2D t, vec4 r, vec2 uv){ return texture2D(t, (uv - r.xz) / r.yw); }
void woodEval(vec3 P, out vec3 col, out float hgt, out float rgh){
  vec3 p = (uAxis < .5 ? P.xyz : P.yxz) + uSeed;
  vec3 n = abs(uAxis < .5 ? vWoodN.xyz : vWoodN.yxz);
  vec3 w = pow(n, vec3(8.)); w /= (w.x + w.y + w.z + 1e-5);
  vec4 s = vec4(0.);
  if (w.z > .002) s += w.z * wTex(uWoodA, uRA, p.xy);         // looking across the log
  if (w.y > .002) s += w.y * wTex(uWoodB, uRB, p.xz);         // looking down onto it
  if (w.x > .002) s += w.x * wTex(uWoodA, uRA, p.zy);         // end grain
  col = s.rgb * s.rgb * uTone;
  const float GS = 1. / 16.;                                    // grain tile = 16 units, ~0.06 units per speck
  float g = w.z * texture2D(uGrain, p.xy * GS).r + w.y * texture2D(uGrain, p.xz * GS).r + w.x * texture2D(uGrain, p.zy * GS).r;
  col *= 1. + (g - .5) * .05;
  const float SS = 1. / 22.;                                    // light scratches, random angles, filtered so they never crawl
  float sc = .5 * w.z * texture2D(uScratch, p.xy * SS + .31).r + w.y * texture2D(uScratch, p.xz * SS).r + w.x * texture2D(uScratch, p.zy * SS + .7).r;
  col = mix(col, col * 1.5 + .025, sc);                                   // fine grain that belongs to the wood
  hgt = (s.a - .7) / 1.5;
  rgh = .36 - hgt * .3;
}
`;
function woodMaterial(axis, seed, plank = 0, tone = 1) {
  const m = new THREE.MeshStandardMaterial({ roughness: .34, metalness: 0 }); m.color.setRGB(1.037, .986, .85);   // blond maple, a shade deeper; the light stays white so books keep true colours
  { const q = new URLSearchParams(location.search).get('wood'); if (q) { const v = q.split(',').map(Number); if (v.length === 3) m.color.setRGB(v[0], v[1], v[2]); } }   // preview tints: ?wood=r,g,b   // deep warm brown; the light stays white so books keep true colours
  m.envMap = WOOD_ENV; m.envMapIntensity = .9;
  m.onBeforeCompile = sh => {
    sh.uniforms.uAxis = { value: axis }; sh.uniforms.uPlank = { value: plank }; sh.uniforms.uTone = { value: tone };
    sh.uniforms.uWoodA = { value: WOOD_A }; sh.uniforms.uWoodB = { value: WOOD_B }; sh.uniforms.uGrain = { value: WOOD_GRAIN }; sh.uniforms.uScratch = { value: WOOD_SCRATCH };
    sh.uniforms.uRA = { value: new THREE.Vector4(WB.A.u0, WB.A.lu, WB.A.v0, WB.A.lv) }; sh.uniforms.uRB = { value: new THREE.Vector4(WB.B.u0, WB.B.lu, WB.B.v0, WB.B.lv) };
    sh.uniforms.uSeed = { value: new THREE.Vector3((seed * 37.7) % 211, (seed * 7.3) % 17, (seed * 3.1) % 13) };
    sh.vertexShader = 'varying vec3 vWoodP; varying vec3 vWoodN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWoodP = position; vWoodN = normal;');
    sh.fragmentShader = WOOD_SAMPLE + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  vec3 wCol; float wH; float wR; woodEval(vWoodP, wCol, wH, wR); diffuseColor.rgb = wCol * diffuse;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = clamp(wR, .25, 1.);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 wdx = dFdx(-vViewPosition), wdy = dFdy(-vViewPosition); float hx = dFdx(wH), hy = dFdy(wH);
    vec3 r1 = cross(wdy, normal), r2 = cross(normal, wdx); float det = dot(wdx, r1);
    normal = normalize(abs(det) * normal - .03 * sign(det) * (hx * r1 + hy * r2)); }`);
  };
  m.customProgramCacheKey = () => 'bookie-wood-baked';
  return m;
}

/* ---------- sound ---------- */
const sfx = (() => {
  let ac = null, noise = null;
  const ctx = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
      const n = ac.sampleRate * 1.5, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      let last = 0; for (let i = 0; i < n; i++) { const wv = Math.random() * 2 - 1; last = last * .55 + wv * .45; d[i] = last; }   // softened noise
      noise = b; }
    if (ac.state === 'suspended') ac.resume().catch(() => { });
    return ac;
  };
  const vary = (v, a) => v * (1 + (Math.random() * 2 - 1) * a);
  // paper and board sliding against wood and the neighbouring books
  function slide(t0, dur, level, from, to) {
    const a = ac, src = a.createBufferSource(); src.buffer = noise; src.playbackRate.value = vary(1, .08);
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = .7;
    bp.frequency.setValueAtTime(from, t0); bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
    const g = a.createGain(); g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + dur * .25); g.gain.linearRampToValueAtTime(level * .55, t0 + dur * .7); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    src.connect(bp).connect(hp).connect(g).connect(a.destination); src.start(t0, Math.random()); src.stop(t0 + dur + .05);
  }
  // a book's weight settling on a wooden shelf: a dull, short body thud with a little contact click
  function knock(t0, level) {
    const a = ac, o = a.createOscillator(), og = a.createGain(), lp = a.createBiquadFilter();
    o.type = 'sine'; const f = vary(118, .12); o.frequency.setValueAtTime(f * 1.6, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + .03);
    lp.type = 'lowpass'; lp.frequency.value = 900;
    og.gain.setValueAtTime(0, t0); og.gain.linearRampToValueAtTime(level, t0 + .004); og.gain.exponentialRampToValueAtTime(.0001, t0 + .14);
    o.connect(lp).connect(og).connect(a.destination); o.start(t0); o.stop(t0 + .16);
    const c = a.createBufferSource(); c.buffer = noise; const cf = a.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = vary(1900, .15); cf.Q.value = 1.2;
    const cg = a.createGain(); cg.gain.setValueAtTime(level * .5, t0); cg.gain.exponentialRampToValueAtTime(.0001, t0 + .035);
    c.connect(cf).connect(cg).connect(a.destination); c.start(t0, Math.random()); c.stop(t0 + .05);
  }
  const play = fn => { const a = ctx(); if (a && noise) fn(a.currentTime + .01); };
  return {
    pull: () => play(t => slide(t, vary(.26, .1), .09, 1400, 2600)),
    back: () => play(t => { slide(t, vary(.22, .1), .07, 2400, 1200); knock(t + .2, .16); }),
    place: () => play(t => { slide(t, vary(.38, .1), .07, 1800, 1100); knock(t + .36, .2); }),
    unlock: () => ctx(),
  };
})();

/* ---------- the bookcase ---------- */
export async function createShelf3D(el, opts) {
  const { colorsOf, onPick, coverSrc, onDismiss } = opts;
  let lamps = !!opts.lamps, envLoaded = false; const lampObjs = [], lampPucks = []; let anchors = opts.anchors || {}; const anchorBoxes = [];
  try { await Promise.all(['500 40px Fraunces', '800 100px Fraunces', '500 20px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch { }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  const DPR_MAX = Math.min(window.devicePixelRatio || 1, 2.5), DPR_MIN = Math.min(DPR_MAX, 2);
  let dpr = DPR_MAX; renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  el.appendChild(renderer.domElement);
  bakeWood(renderer);

  const scene = new THREE.Scene(); scene.background = new THREE.Color('#a8763f');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  { // a warm, dim room for the varnish to mirror: lamp glow overhead, amber at eye level, dark floor
    const c = cnv(64, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#fff0dc'); g.addColorStop(.22, '#e8c9a0'); g.addColorStop(.46, '#b8946c'); g.addColorStop(.56, '#8a6a4a'); g.addColorStop(.75, '#2a170a'); g.addColorStop(1, '#120a04');
    x.fillStyle = g; x.fillRect(0, 0, 64, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
    WOOD_ENV = pmrem.fromEquirectangular(t).texture; t.dispose();
  }
  scene.environmentIntensity = 0.45;
  // real light captured in an apartment (CC0, Poly Haven via pmndrs/assets)
  const envReady = new Promise(res => new EXRLoader().load(new URL('./assets/apartment.exr', import.meta.url).href, t => {
    t.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = pmrem.fromEquirectangular(t).texture; t.dispose();
    scene.environmentRotation.set(0, Math.PI * .85, 0); envLoaded = true; applyLamps();
    needs = true; res(true);
  }, undefined, () => res(false)));
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2000);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xe6dccf, 0.3); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfffaf4, 2.7); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.radius = 5; key.shadow.blurSamples = 8; key.shadow.intensity = .42;
  scene.add(key, key.target);
  const bounces = [];
  const fill = new THREE.DirectionalLight(0xfffaf4, 0.25); fill.position.set(0, H * .45, 200); scene.add(fill);
  const rake = new THREE.DirectionalLight(0xfffaf4, 0.35); rake.position.set(160, H * .6, 70); scene.add(rake);

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (canvas, srgb = true, rep) => { const t = new THREE.CanvasTexture(canvas); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; if (rep) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; } return t; };
  const clothTex = tex(clothCanvas(), false, 1); clothTex.repeat.set(3, 3);
  const pagesTex = tex(pagesCanvas());
  const pagesMat = new THREE.MeshStandardMaterial({ map: pagesTex, roughness: .92, metalness: 0 });
  const gradTex = (() => { const c = cnv(64, 2), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.35, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 2);
    const t = new THREE.CanvasTexture(c); return t; })();
  const edgeAOMat = new THREE.MeshBasicMaterial({ map: gradTex, transparent: true, opacity: .16, depthWrite: false });
  const vGradTex = (() => { const c = cnv(2, 64), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.4, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 2, 64);
    return new THREE.CanvasTexture(c); })();
  const floorAOMat = new THREE.MeshBasicMaterial({ map: vGradTex, transparent: true, opacity: .16, depthWrite: false });
  const contactTex = (() => { const c = cnv(128, 128), x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(.45, 'rgba(0,0,0,.55)'); g.addColorStop(.75, 'rgba(0,0,0,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); return t; })();
  const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, color: 0x1a0d04, transparent: true, opacity: .42, depthWrite: false, visible: false });   // painted pools read as dark blobs; real shadows only
  const ironMat = new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: .7, roughness: .42 });
  const brassEdge = new THREE.MeshStandardMaterial({ color: '#b48c42', metalness: 1, roughness: .38 });
  const spineNormal = new THREE.CanvasTexture(spineNormalCanvas()); spineNormal.colorSpace = THREE.NoColorSpace; spineNormal.wrapT = THREE.RepeatWrapping;

  const caseGroup = new THREE.Group(), booksGroup = new THREE.Group(); scene.add(caseGroup, booksGroup);
  let primed = false, clock = 0, lastReal = performance.now(), lastTilt = 0, slowFrames = 0, lastDraw = 0;
  let visW = 50, rows = [], books = [], view = 'spines', needs = true, raf = 0, disposed = false, paused = false;
  const texCache = new Map(), coverCache = new Map(), tweens = [];
  const geoms = [];

  const camBase = new THREE.Vector3(), tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const win = { x0: 0, x1: 0, y0: 0, y1: 0, z: 1.2 };
  function aimCamera() {
    const ex = camBase.x + tilt.x * 14, ey = camBase.y + tilt.y * 10, ez = camBase.z;
    camera.position.set(ex, ey, ez); camera.quaternion.identity(); camera.updateMatrixWorld();
    const n = camera.near, k = n / (ez - win.z);
    camera.projectionMatrix.makePerspective((win.x0 - ex) * k, (win.x1 - ex) * k, (win.y1 - ey) * k, (win.y0 - ey) * k, n, camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    let b0 = null, g0 = null;
    const onOri = e => {
      if (e.beta == null || e.gamma == null) return;
      if (b0 === null) { b0 = e.beta; g0 = e.gamma; }
      b0 += (e.beta - b0) * .0025; g0 += (e.gamma - g0) * .0025;        // slowly re-centre on however you hold the phone
      const c = v => Math.max(-1, Math.min(1, v / 12));
      const nx = -c(e.gamma - g0), ny = c(e.beta - b0);   // left-right is mirrored for the window effect; up-down already felt right
      if (Math.abs(nx - tilt.tx) > .012) tilt.tx = nx; if (Math.abs(ny - tilt.ty) > .012) tilt.ty = ny;
    };
    const startOri = () => {
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', onOri); }).catch(() => { });
      else addEventListener('deviceorientation', onOri);
    };
    if (typeof window.DeviceOrientationEvent?.requestPermission === 'function') el.addEventListener('pointerdown', startOri, { once: true });   // iPhone asks first
    else startOri();
    if (matchMedia('(hover: hover)').matches) el.addEventListener('pointermove', e => {     // a mouse does the same on a computer
      if (pulled) return; const r = el.getBoundingClientRect(); tilt.tx = ((e.clientX - r.left) / r.width - .5) * 1.4; tilt.ty = -((e.clientY - r.top) / r.height - .5) * 1.4;
    });
  }
  function frame() {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return false;
    renderer.setSize(w, h, false);
    const d = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)), yc = H * CAM_Y, fullH = h * (2 * yc / H);
    const Y0 = .3, TOP = -.15, dock = document.querySelector('.dock');   // TOP: the thick top board and a sliver above it
    let need = 110;   // px from the bottom of the screen to the bottom of the lowest shelf
    if (dock) { const r = dock.getBoundingClientRect(), gap = Math.max(14, innerHeight - r.bottom); need = (innerHeight - r.top) + gap - 11; }
    const f = need / h, rest = BT + 3 * (HC + BT) + TOP;
    PL = Math.max(9, Math.min(30, (f * rest + Y0) / (1 - f)));
    H = PL + BT + 3 * (HC + BT);
    const winH = H + TOP - Y0;
    const d2 = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2)); camBase.z = d2;
    visW = winH * (w / h);                                         // the whole case, side walls included, fills the screen exactly
    Object.assign(win, { x0: -visW / 2, x1: visW / 2, y0: Y0, y1: H + TOP });
    camera.aspect = w / h; camBase.set(0, H * CAM_Y, d2); aimCamera();
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
  // ---- a potted pothos that sits in the emptiest shelf and trails over its edge ----
  const plantGroup = new THREE.Group(); scene.add(plantGroup);
  let plantKit = null;
  function getPlantKit() {
    if (plantKit) return plantKit;
    const sh = new THREE.Shape(); sh.moveTo(0, -1); sh.bezierCurveTo(.75, -.55, .95, .25, .5, .62); sh.bezierCurveTo(.25, .82, .05, .6, 0, .42); sh.bezierCurveTo(-.05, .6, -.25, .82, -.5, .62); sh.bezierCurveTo(-.95, .25, -.75, -.55, 0, -1);
    const lg = new THREE.ShapeGeometry(sh, 10), pos = lg.attributes.position, uv = lg.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const X = pos.getX(i), Y = pos.getY(i); uv.setXY(i, (X + 1) / 2, (Y + 1) / 2); pos.setZ(i, -Math.abs(X) * .28 - (Y + 1) * (Y + 1) * .05); pos.setY(i, Y - .42); }
    lg.computeVertexNormals();
    const lt = tex(leafCanvas());
    const prof = [[0, 0], [1.45, 0], [1.55, .15], [1.95, 3.0], [2.15, 3.0], [2.15, 3.55], [1.8, 3.55], [1.75, 3.2], [0, 3.2]].map(([r, y]) => new THREE.Vector2(r, y));
    plantKit = {
      leaf: lg,
      mats: ['#ffffff', '#d9efc0', '#b8d69a'].map(c => new THREE.MeshStandardMaterial({ map: lt, color: c, side: THREE.DoubleSide, roughness: .5 })),
      stem: new THREE.MeshStandardMaterial({ color: '#4a5a2a', roughness: .7 }),
      potGeo: new THREE.LatheGeometry(prof, 28),
      potMat: new THREE.MeshStandardMaterial({ color: '#b4603a', roughness: .82 }),
      soilGeo: new THREE.CircleGeometry(1.76, 24),
      soilMat: new THREE.MeshStandardMaterial({ color: '#2a1b10', roughness: 1 }),
    };
    return plantKit;
  }
  const _dummy = new THREE.Object3D();
  function buildPlant(px, base) {
    const leafSets = [[], [], []];
    const kit = getPlantKit(), g = new THREE.Group(), rnd = hash2(91), pz = -8.5, S = 1.3, top = base + 3.3 * S;
    const pot = new THREE.Mesh(kit.potGeo, kit.potMat); pot.position.set(px, base, pz); pot.scale.setScalar(S); pot.castShadow = pot.receiveShadow = true; g.add(pot);
    const soil = new THREE.Mesh(kit.soilGeo, kit.soilMat); soil.rotation.x = -Math.PI / 2; soil.position.set(px, base + 3.22 * S, pz); soil.scale.setScalar(S); g.add(soil);
    const V = (x, y, z) => new THREE.Vector3(x, y, z), strands = [];
    // a mound of foliage in the pot
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + .4, c = Math.cos(a), sn = Math.sin(a), up = 4 + rnd(i, 1) * 2.6;
      strands.push({ pts: [V(px + c * .5, top, pz + sn * .5), V(px + c * 1.8, top + up, pz + sn * 1.8), V(px + c * 3.8, top + up - 1 - rnd(i, 2), pz + sn * 3)], size: 1.5 });
    }
    // trailers that run forward and spill over the edge of the shelf
    [[-3.5, 8], [-5.3, 4], [2.3, 5.5]].forEach(([dx, drop], i) => {
      strands.push({ pts: [V(px + dx * .3, top, pz + 1), V(px + dx * .7, top + 1.6, pz + 4), V(px + dx, base + 2.2, -2), V(px + dx, base + .5, 1.5), V(px + dx + .2, base - drop * .45, 2.3), V(px + dx - .2 + rnd(i, 5) * .6, base - drop, 2.4)], size: 1.15, trail: true });
    });
    strands.forEach(({ pts, size, trail }, si) => {
      const curve = new THREE.CatmullRomCurve3(pts), len = curve.getLength();
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, .07, 5), kit.stem); tube.userData.temp = true; tube.castShadow = true; g.add(tube);
      const n = Math.max(3, Math.round(len / 1.25));
      for (let k = 0; k < n; k++) {
        const t = (k + .7) / n, pt = curve.getPoint(Math.min(1, t)), sd = k % 2 ? 1 : -1;
        if (trail && t < .34) continue;   // keep the pot itself in view
        const leaf = _dummy;
        leaf.scale.setScalar(size * (.8 + rnd(k, si) * .45));
        leaf.position.copy(pt).add(V(sd * .25, 0, .15 + rnd(k, si + 9) * .4));
        leaf.rotation.set(-.3 + rnd(k, si + 3) * .6, sd * (.15 + rnd(k, si + 5) * .5), sd * (.35 + rnd(k, si + 7) * .8));
        leaf.updateMatrix(); leafSets[(k + si) % 3].push(leaf.matrix.clone());
      }
    });
    leafSets.forEach((list, mi) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(kit.leaf, kit.mats[mi], list.length);
      list.forEach((mx, n) => im.setMatrixAt(n, mx)); im.castShadow = im.receiveShadow = true; g.add(im);
    });
    return g;
  }
  const SHOW_PLANT = false;
  function placePlant() {
    plantGroup.traverse(o => { if (o.userData.temp) o.geometry.dispose(); }); plantGroup.clear();
    let best = null;
    for (const r of rows) { const free = visW - 3.7 - r.contentW; if (free >= 12 && (!best || free > best.free + .5)) best = { r, free }; }
    if (SHOW_PLANT && best) plantGroup.add(buildPlant(visW / 2 - 1.2 - 3.4, best.r.base));
  }
  function applyLamps() {
    lampObjs.forEach(o => o.visible = lamps); lampPucks.forEach(m => m.emissiveIntensity = lamps ? .9 : 0);
    bounces.forEach(l => l.intensity = lamps ? .55 : .45);
    key.intensity = lamps ? 1.5 : 3.0; fill.intensity = lamps ? .22 : .32; rake.intensity = lamps ? .1 : .35; hemi.intensity = lamps ? .55 : .3; hemi.color.set(lamps ? 0xfff0dc : 0xffffff);
    scene.environmentIntensity = (envLoaded ? .6 : .45) * (lamps ? .55 : 1); needs = true;
  }
  let woodSeed = 0;
  function boardMat(lenU, depthU, axis = 0) { return woodMaterial(axis, ++woodSeed, 0, axis ? .8 : .64); }   // shelf boards catch more light, so they're toned to match the back
  function buildCase() {
    caseGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => { if (m === ironMat || m === brassEdge) return; m.map && m.map.dispose?.(); m.dispose(); }); } });
    caseGroup.clear();
    const d = camera.position.z; const backScale = (d + DEPTH) / d;
    const W = visW * backScale + 8, BH = H * backScale + 20;
    // back panel
    woodSeed = 0;
    const bm = woodMaterial(1, 77, 0, .86);   // grain runs up the back, like the iBooks case   // tongue-and-groove back, grain running up
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, BH), bm); back.position.set(0, H / 2, -DEPTH); back.receiveShadow = true; caseGroup.add(back);
    // soft occlusion in each compartment
    const aoTex = tex(aoCanvas(), false); const aoSideTex = tex(aoSideCanvas(), false);
    for (let j = 0; j < 3; j++) {
      const base = PL + BT + j * (HC + BT);
      const innerW = visW - 2 * 1.2;   // between the side posts, so the corner shading is actually visible
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(innerW, HC), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }));
      ao.position.set(0, base + HC / 2, -DEPTH + .05); caseGroup.add(ao);
      [-1, 1].forEach(sgn => {
        const sm = new THREE.MeshBasicMaterial({ map: aoSideTex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        const side = new THREE.Mesh(new THREE.PlaneGeometry(DEPTH, HC), sm);
        side.rotation.y = sgn < 0 ? Math.PI / 2 : -Math.PI / 2; if (sgn > 0) side.scale.x = -1;   // dark end always at the back
        side.position.set(sgn * (innerW / 2 - .03), base + HC / 2, -DEPTH / 2); caseGroup.add(side);
      });
    }
    // boards
    const bw = W;
    const boardYs = [PL + BT / 2]; for (let j = 1; j <= 3; j++) boardYs.push(PL + BT + j * (HC + BT) - BT / 2);
    boardYs.forEach((y, j) => {
      const isTop = j === 3; const thick = BT;   // the top is the same thickness as every shelf
      const m = new THREE.Mesh(RBox(bw, thick, DEPTH + 1, thick * .32), boardMat(bw, DEPTH));
      m.position.set(0, isTop ? y + thick / 2 - BT / 2 : y, -DEPTH / 2 + .5); m.castShadow = m.receiveShadow = true; caseGroup.add(m);
      // a slightly rounded lip on the front edge
      // (front edge is now part of the rounded board)
    });
    // side frame, like a real case
    bounces.length = 0;   // bounce light now comes from the hemisphere light's warm ground colour
    applyLamps();
    const POST = 1.2;
    [-1, 1].forEach(sgn => {
      const post = new THREE.Mesh(RBox(POST, H + 10, DEPTH + 2, .35), boardMat(H, DEPTH, 1));
       
      post.material.envMapIntensity = .35; post.material.clearcoat = .2;
      post.position.set(sgn * (visW / 2 - POST / 2), H / 2, -DEPTH / 2 + .9); post.castShadow = post.receiveShadow = true; caseGroup.add(post);
      for (let j = 1; j <= 3; j++) for (const pz of [-2.6, -DEPTH + 3]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .55, 12), brassEdge);
        pin.rotation.z = Math.PI / 2; pin.position.set(sgn * (visW / 2 - POST - .27), PL + BT + j * (HC + BT) - BT - .16, pz); pin.castShadow = true; caseGroup.add(pin);
      }
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
    const pm = new THREE.Mesh(RBox(bw, PL, 3, .4), boardMat(bw, 10)); 
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
      const pw = 12.4, ph = Math.min(BT + .25, pw * 200 / 1024);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, .12), [brassEdge, brassEdge, brassEdge, brassEdge, mat, brassEdge]);
      plate.position.set(0, y, 1.48); plate.castShadow = true; caseGroup.add(plate);
    });
    // downlights under each shelf
    lampObjs.length = 0; lampPucks.length = 0;
    const pc = cnv(256, 256), px = pc.getContext('2d'); px.fillStyle = '#000'; px.fillRect(0, 0, 256, 256);
    px.save(); px.translate(128, 0); px.scale(.5, 1); const pg = px.createRadialGradient(0, -6, 4, 0, -6, 235);
    pg.addColorStop(0, 'rgba(255,236,200,1)'); pg.addColorStop(.12, 'rgba(255,214,150,.75)'); pg.addColorStop(.5, 'rgba(255,180,100,.2)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
    px.fillStyle = pg; px.fillRect(-256, 0, 512, 256); px.restore();
    const nL = Math.max(2, Math.round(visW / 10)), poolTex = tex(pc, true, 1); poolTex.wrapS = THREE.RepeatWrapping; poolTex.repeat.set(nL, 1);
    const rimMat = new THREE.MeshStandardMaterial({ color: '#b9a586', metalness: .85, roughness: .38 });
    const puckMat = new THREE.MeshStandardMaterial({ color: '#d8c7a8', roughness: .6, emissive: '#ffb45e', emissiveIntensity: 0 }); lampPucks.push(puckMat);
    for (let j = 0; j < 3; j++) {
      const base = PL + BT + j * (HC + BT);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(visW * backScale, HC), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .8 }));
      pool.position.set(0, base + HC / 2, -DEPTH + .12); pool.renderOrder = 1; caseGroup.add(pool); lampObjs.push(pool);
      for (let i = 0; i < nL; i++) {
        const lx = (-.5 + (i + .5) / nL) * visW * backScale;   // directly above its pool of light on the back panel
        // a small recessed puck light: brushed rim, frosted warm lens set slightly inside it
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(.5, .56, .14, 24), rimMat); rim.position.set(lx, base + HC - .07, -DEPTH + 1.6); caseGroup.add(rim);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(.36, 24), puckMat); lens.rotation.x = Math.PI / 2; lens.position.set(lx, base + HC - .15, -DEPTH + 1.6); caseGroup.add(lens);
      }
      // (no live point lights here: far too costly on phones)
    }
    applyLamps();
    // light
    key.position.set(visW * .12 + 3, H + 170, 95); key.target.position.set(0, H / 2, -DEPTH / 2);
    const sc = key.shadow.camera; const R = Math.max(W, H) * .9 + 40; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 400; sc.updateProjectionMatrix();
  }

  function dimsOf(b) {
    const h = hashStr(b.id), r = n => ((h >>> n) & 1023) / 1023;
    // format: mass-market paperback, trade paperback, hardback, tall art/large-format
    let f = r(3);
    if (b.format === 'hard') f = .62 + r(3) * .38; else if (b.format === 'paper') f = r(3) * .62;
    const base = f < .2 ? 18.2 : f < .62 ? 20.4 : f < .9 ? 22.4 : 23.6;
    const real = +b.heightCm >= 10 && +b.heightCm <= 40 ? Math.max(15, +b.heightCm) : 0;   // one unit is about a centimetre
    const ht = Math.min(HC - 1.1, real || base + (r(7) - .5) * 1.2);
    // true to life: one unit is about a centimetre, so thickness follows the real page count
    const pages = +b.pages > 0 ? +b.pages : 300;
    const paper = f < .2 ? .0056 : .0064;                     // cm per page; bulkier stock outside mass-market
    const t = Math.max(.55, Math.min(8, pages * paper + (f >= .62 ? .55 : .1)));
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
  // The most common real colour in a strip of the cover (averaging mixes colours into a muddy grey).
  function avgColor(img, sx, sw, prefer = 'common') {
    const W = 12, Hh = 48, c = cnv(W, Hh), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, W, Hh);
    const d = x.getImageData(0, 0, W, Hh).data, bk = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] >> 5) << 6 | (d[i + 1] >> 5) << 3 | (d[i + 2] >> 5);
      const e = bk.get(k) || [0, 0, 0, 0]; e[0] += d[i]; e[1] += d[i + 1]; e[2] += d[i + 2]; e[3]++; bk.set(k, e);
    }
    const sat = c3 => { const mx = Math.max(...c3), mn = Math.min(...c3); return mx ? (mx - mn) / mx : 0; };
    const cols = [...bk.values()].map(e => ({ c: [e[0] / e[3], e[1] / e[3], e[2] / e[3]], n: e[3] }));
    cols.sort((a, b2) => prefer === 'vivid' ? (b2.n * (.3 + sat(b2.c))) - (a.n * (.3 + sat(a.c))) : b2.n - a.n);
    return cols[0].c;
  }
  function spineShading(x, w, h) {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,.1)'); g.addColorStop(.06, 'rgba(0,0,0,.02)'); g.addColorStop(.94, 'rgba(0,0,0,.02)'); g.addColorStop(1, 'rgba(0,0,0,.1)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // a touch of shelf wear at head and tail
    const e = x.createLinearGradient(0, 0, 0, h); e.addColorStop(0, 'rgba(0,0,0,.05)'); e.addColorStop(.02, 'rgba(0,0,0,0)'); e.addColorStop(.98, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,.06)');
    x.fillStyle = e; x.fillRect(0, 0, w, h);
  }
  function spineFromPhoto(dims, img) {
    const w = Math.max(20, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
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
    const mid = avgColor(img, Math.round(iw * .15), Math.round(iw * .7), 'vivid');
    return { edge, mid };
  }
  const rgbStr = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  // Read the whole cover: its colour groups, how bright, how colourful and how busy it is.
  function readCover(img) {
    const W = 24, Hh = 36, c = cnv(W, Hh), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, Hh);
    const d = x.getImageData(0, 0, W, Hh).data, bk = new Map(); let lumSum = 0, lumSq = 0, satSum = 0, n = 0;
    const L = c3 => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c3[0]) + .7152 * f(c3[1]) + .0722 * f(c3[2]); };
    const S = c3 => { const mx = Math.max(...c3), mn = Math.min(...c3); return mx ? (mx - mn) / mx : 0; };
    for (let i = 0; i < d.length; i += 4) {
      const px = [d[i], d[i + 1], d[i + 2]], l = L(px); lumSum += l; lumSq += l * l; satSum += S(px); n++;
      const k = (d[i] >> 5) << 6 | (d[i + 1] >> 5) << 3 | (d[i + 2] >> 5);
      const e = bk.get(k) || [0, 0, 0, 0]; e[0] += d[i]; e[1] += d[i + 1]; e[2] += d[i + 2]; e[3]++; bk.set(k, e);
    }
    const groups = [...bk.values()].map(e => { const c3 = [e[0] / e[3], e[1] / e[3], e[2] / e[3]]; return { c: c3, n: e[3] / n, l: L(c3), s: S(c3) }; }).sort((a, b2) => b2.n - a.n);
    const mean = lumSum / n;
    return { groups, mean, contrast: Math.sqrt(Math.max(0, lumSq / n - mean * mean)), sat: satSum / n, busy: groups.filter(g => g.n > .03).length, L };
  }
  const ratio = (a, b2) => (Math.max(a, b2) + .05) / (Math.min(a, b2) + .05);
  // A spine designed from the cover without any AI: background from the wrap-around edge,
  // lettering in the cover's own title colour, an accent from its strongest colour, a style that suits its look.
  function spineFromCover(b, dims, col, img) {
    const w = Math.max(20, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
    const c = cnv(w, h), x = c.getContext('2d');
    const { edge } = coverColours(img), info = readCover(img), bgL = info.L(edge);
    x.fillStyle = rgbStr(edge); x.fillRect(0, 0, w, h);
    speckle(x, w, h, hashStr(b.id), .8);
    // lettering: a real colour from the cover that reads clearly on the background (title type is usually that)
    const inkG = info.groups.filter(g => g.n > .006 && ratio(g.l, bgL) >= 3.2).sort((a, b2) => (b2.n * ratio(b2.l, bgL)) - (a.n * ratio(a.l, bgL)))[0];
    const ink = inkG ? rgbStr(inkG.c) : (bgL > .3 ? '#1d1a16' : '#f6efe2');
    // accent: the cover's most vivid colour that isn't the background or the lettering
    const far = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const accG = info.groups.filter(g => g.n > .01 && g.s > .35 && far(g.c, edge) > 70 && (!inkG || far(g.c, inkG.c) > 60)).sort((a, b2) => b2.s * b2.n - a.s * a.n)[0];
    const acc = accG ? rgbStr(accG.c) : ink;
    // style from the cover's character
    let style;
    if (w >= 3.1 * PPU && (b.title || '').split(/\s+/).length <= 4) style = 'stack';
    else if (info.sat < .18 && info.contrast < .16) style = 'quiet';            // pale, calm, minimal covers
    else if (info.contrast > .3 && info.sat < .3) style = 'heavy';            // stark, high-contrast covers
    else if (info.busy >= 7 && info.sat > .35) style = 'block';               // colourful, busy covers
    else if (dims.hard && info.mean < .25) style = 'classic';                 // dark literary hardbacks
    else style = hashStr(b.id + 'st') % 2 ? 'cond' : 'classic';
    typeSpine(x, w, h, b, style, ink, acc);
    wear(x, w, h, b, dims);
    if (dims.hard) hinges(x, w, h);
    spineShading(x, w, h); return c;
  }

  function spineFromDesign(b, dims, d) {
    const w = Math.max(20, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
    const c = cnv(w, h), x = c.getContext('2d');
    x.fillStyle = d.bg; x.fillRect(0, 0, w, h);
    speckle(x, w, h, hashStr(b.id), .6);
    let st = STYLES.includes(d.style) ? d.style : styleOf(b, w); if (st === 'stack' && w < 3.1 * PPU) st = 'cond';
    typeSpine(x, w, h, b, st, d.ink, d.accent);
    if (dims.hard) hinges(x, w, h);
    spineShading(x, w, h); return c;
  }
  const hexOK = v => /^#[0-9a-f]{6}$/i.test(v || '');
  const designOf = b => (b.spine && hexOK(b.spine.bg) && hexOK(b.spine.ink) && hexOK(b.spine.accent)) ? b.spine : null;
  function spineTex(b, dims, col) {
    const k = [b.id, b.title, b.author, col.bg, col.acc, b.coverUrl || '', b.spineUrl || '', JSON.stringify(b.spine || ''), dims.t.toFixed(2), dims.h.toFixed(2)].join('|');
    if (texCache.has(k)) return texCache.get(k);
    const t = tex(spineCanvas(b, dims, col)); texCache.set(k, t);
    (async () => {
      const sp = await loadImage(b.spineUrl);
      if (sp) { t.image = spineFromPhoto(dims, sp); t.dispose(); t.needsUpdate = true; needs = true; return; }
      const dz = designOf(b);
      if (dz) { t.image = spineFromDesign(b, dims, dz); t.dispose(); t.needsUpdate = true; needs = true; return; }
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
    const board = new THREE.MeshStandardMaterial({ color: sideCol, roughness: jacket ? .55 : .8, bumpMap: clothTex, bumpScale: jacket ? .15 : .5, envMapIntensity: .3 });
    const boardEdge = new THREE.MeshStandardMaterial({ color: sideCol.clone().multiplyScalar(.96), roughness: .85 });
    const spine = jacket
      ? new THREE.MeshStandardMaterial({ map: spineTex(b, dims, col), normalMap: spineNormal, normalScale: new THREE.Vector2(dims.hard ? .3 : .55, 1), roughness: .5, envMapIntensity: .3 })
      : new THREE.MeshStandardMaterial({ map: spineTex(b, dims, col), normalMap: spineNormal, normalScale: new THREE.Vector2(dims.hard ? .3 : .5, .9), roughness: .86, bumpMap: clothTex, bumpScale: .35, envMapIntensity: .3 });
    // the sides take the colour of the cover's edge once the real cover arrives
    if (b.coverUrl && !b.spineUrl) loadImage(b.coverUrl).then(img => {
      if (!img) return;
      try { const dz = designOf(b); const e = coverColours(img).edge; const k = new THREE.Color(dz ? dz.bg : rgbStr(e)); k.convertSRGBToLinear(); board.color.copy(k).multiplyScalar(.95); boardEdge.color.copy(k).multiplyScalar(.9); needs = true; } catch { }
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
      add(RBox(pw, ph, pd, .05), [pagesMat, pagesMat, pagesMat, pagesMat, pagesMat, pagesMat], 0, 0, pgF - pd / 2);
      for (const sgn of [-1, 1]) { const bm = add(RBox(BT, h, bdD, .09), [board, board, boardEdge, boardEdge, boardEdge, boardEdge], sgn * (t / 2 - BT / 2), 0, bdF - bdD / 2); if (sgn > 0) g.userData.front = bm; }
      add(RBox(t, h, SP, .08), [boardEdge, boardEdge, boardEdge, boardEdge, boardEdge, boardEdge], 0, 0, d / 2 - SP / 2 - bulge);
      add(curvedPanel(t, h, bulge), spine, 0, 0, d / 2 - bulge);
      g.userData.front_z = d / 2;
    } else {
      // paperback: flush cut, thin card cover, page edges showing at head and tail
      const CT = .07;
      add(RBox(t - 2 * CT, h - .02, d - CT, .04), [pagesMat, pagesMat, pagesMat, pagesMat, pagesMat, pagesMat], 0, 0, -CT / 2);
      for (const sgn of [-1, 1]) { const bm = add(RBox(CT, h, d, .12), [board, board, boardEdge, boardEdge, boardEdge, boardEdge], sgn * (t / 2 - CT / 2), 0, 0); if (sgn > 0) g.userData.front = bm; }
      g.userData.front_z = d / 2;
      add(RBox(t, h, CT, .12), [boardEdge, boardEdge, boardEdge, boardEdge, spine, boardEdge], 0, 0, d / 2 - CT / 2);
    }
    if (false) {   // bookmark ribbons removed
      const hv2 = hashStr(b.id + 'r'), rc = ['#a3202c', '#c9a227', '#1f4e79', '#2f6b4a'][hv2 % 4];
      const rm = new THREE.MeshStandardMaterial({ color: rc, roughness: .75, side: THREE.DoubleSide });
      const rw = Math.min(.34, dims.t * .45), rx = (((hv2 >>> 3) % 5) - 2) * dims.t * .07, drop = 1.15 + ((hv2 >>> 6) % 5) * .1, zf = dims.d / 2 + .06;
      const hang = new THREE.Mesh(new THREE.PlaneGeometry(rw, drop), rm); hang.position.set(rx, dims.h / 2 - drop / 2 + .03, zf);
      const over = new THREE.Mesh(new THREE.PlaneGeometry(rw, 1.6), rm); over.rotation.x = -Math.PI / 2; over.position.set(rx, dims.h / 2 + .03, zf - .8);
      geoms.push(hang.geometry, over.geometry); g.add(hang, over);
    }
    g.userData.book = b; g.userData.col = col; g.userData.boardMat = board; g.userData.dims = dims;
    showCover(g, true);   // the real front cover is always on the front board
    return g;
  }
  function buildBooks() {
    const shared = new Set([pagesMat, edgeAOMat, floorAOMat, ironMat, contactMat]);
    booksGroup.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => !shared.has(m) && m.dispose()); });
    geoms.forEach(g => g.dispose()); geoms.length = 0; booksGroup.clear();
    rows = ROWS.map((st, j) => {
      const base = PL + BT + j * (HC + BT);
      const list = books.filter(b => (b.status || 'reading') === st);
      if (st === 'finished') list.sort((a, b) => (b.finished || '').localeCompare(a.finished || ''));
      else if (st === 'reading') list.sort((a, b) => (b.started || '').localeCompare(a.started || ''));
      else list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const g = new THREE.Group(); booksGroup.add(g);
      const left = -visW / 2 + 1.2 + .35 + 0; let x = left; const items = [];
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
        pivot.rotation.y = ((hv % 5) - 2) * .012;
        pivot.rotation.z = (((hv >>> 7) % 7) - 3) * .0035;   // a degree or so off upright
        // contact shading where this book meets its neighbours
        const zf = mesh.userData.front_z + .02, aw = Math.min(.55, dims.t * .3), aos = [];
        [[-1, sDims[i - 1]], [1, sDims[i + 1]]].forEach(([sg, nb]) => {
          const ah = nb ? Math.min(dims.h, nb.h) : dims.h * .35;
          const q = new THREE.Mesh(new THREE.PlaneGeometry(aw, ah), edgeAOMat); geoms.push(q.geometry);
          q.position.set(sg * (dims.t / 2 - aw / 2), -dims.h / 2 + ah / 2, zf); if (sg > 0) q.scale.x = -1;
          q.renderOrder = 2; mesh.add(q); aos.push(q);
        });
        mesh.userData.aos = aos;
        // tight, dark shadow right where the book stands; the cast shadow softens further out
        const cs = new THREE.Mesh(new THREE.PlaneGeometry(dims.t + 2.2, dims.d + 2.4), contactMat); geoms.push(cs.geometry);
        cs.rotation.x = -Math.PI / 2; cs.position.set(dims.t / 2, .025, 0); cs.renderOrder = 1; pivot.add(cs); pivot.userData.contact = cs;
        x += dims.t + .02 + (hv % 9 === 0 ? .1 : 0);
        pivot.userData = { id: b.id, home: pivot.position.clone(), rot: pivot.rotation.clone(), d: dims.d };
        g.add(pivot); items.push(pivot);
      });
      const standW = x - left;
      // (the painted shadow strip in front of the books is gone; the real shadows do the work)
      if (false) {
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
        // it rests on its lower-left corner (the right side lifts off the shelf) and touches the neighbour's side or top corner
        const hPrev = sDims[standing.length - 2].h;
        p.position.x = prevRight + Math.min(dims.h * Math.sin(a), hPrev * Math.tan(a)) + dims.t * Math.cos(a) + .03; p.rotation.z = a;
        p.position.y += dims.t * Math.sin(a);
        if (p.userData.contact) { p.userData.contact.visible = false; p.userData.contact = null; }
        // the lifted, leaning book only casts a faint shadow: a full one floats off as a dark blob
        m.traverse(o => { if (o.isMesh) o.castShadow = false; });
        { const cs = new THREE.Mesh(new THREE.PlaneGeometry(dims.t + 1.4, dims.d + 1.6), contactMat); geoms.push(cs.geometry);
          cs.rotation.x = -Math.PI / 2; cs.position.set(prevRight + dims.t * .55, base + .025, p.position.z); cs.renderOrder = 1; cs.material = contactMat; cs.scale.set(1, 1, 1); g.add(cs);
          cs.userData.lean = true; p.userData.contactFlat = cs; }
        p.userData.home = p.position.clone(); p.userData.rot = p.rotation.clone();
      }
      const row = { st, group: g, items, base, contentW, offset: 0, vel: 0 };
      row.min = Math.min(0, visW - 3.7 - contentW); return row;
    });
    placePlant();
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
  el.addEventListener('pointerdown', () => sfx.unlock(), { capture: true });
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
      if (!m.userData.coverMat) m.userData.coverMat = new THREE.MeshStandardMaterial({ map: coverTex(m.userData.book, m.userData.col), roughness: .55, envMapIntensity: .3 });
      fb.material = fb.material.slice(); fb.material[0] = m.userData.coverMat;
    }   // the cover stays on the book when it goes back
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
    const yc = camBase.y;
    return { x: -(row ? row.group.position.x : 0) - m.position.x, y: yc + (.80 * H - yc) / k - m.position.y, z: d * (1 - 1 / k) };
  }
  // The book leaves the shelf, turns its cover to you and rises to the top of the screen.
  function toHero(p, instant, delay = 0) {
    const m = p.children[0], t = heroTarget(p);
    if (p.userData.contact) p.userData.contact.visible = false;
    if (p.userData.contactFlat) p.userData.contactFlat.visible = false;
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
    pushBack(); pulled = p; sfx.pull();
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
    setTimeout(() => sfx.back(), 300);
    cancel(p.position, p.rotation, m.rotation, dim.material);
    tween(p.position, 'x', h.x, 420); tween(p.position, 'y', h.y + .6, 420); tween(p.position, 'z', outZ(p), 420);
    tween(m.rotation, 'y', 0, 400); tween(m.rotation, 'z', p.userData.flat ? Math.PI / 2 : 0, 400);
    tween(p.rotation, 'z', r0.z, 400); tween(p.rotation, 'y', r0.y, 400);
    tween(dim.material, 'opacity', 0, 380);
    tween(p.position, 'z', h.z, 300, 400); tween(p.position, 'y', h.y, 300, 400);
    setTimeout(() => { if (pulled !== p) { if (p.userData.contact) p.userData.contact.visible = true; if (p.userData.contactFlat) p.userData.contactFlat.visible = true; showCover(m, false); if (!p.userData.contactFlat) m.traverse(o => { if (o.isMesh && o.material !== edgeAOMat) o.castShadow = true; }); needs = true; } if (!pulled) dim.visible = false; }, 740);
  }
  function tween(obj, prop, to, dur, delay = 0) {
    tweens.push({ obj, prop, from: null, to, dur, start: clock + delay });
  }

  function loop() {
    if (disposed) return; raf = requestAnimationFrame(loop);
    const real = performance.now(); clock += Math.min(34, real - lastReal); lastReal = real; const now = clock;
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
    let moved = false;
    // while a book is out and its page is open, the view eases back to centre and holds still
    const gx = pulled ? 0 : tilt.tx, gy = pulled ? 0 : tilt.ty;
    if ((Math.abs(gx - tilt.x) > .006 || Math.abs(gy - tilt.y) > .006) && real - lastTilt > 30) { lastTilt = real; tilt.x += (gx - tilt.x) * .22; tilt.y += (gy - tilt.y) * .22; aimCamera(); moved = true; }
    else if (pulled && (tilt.x || tilt.y) && Math.abs(tilt.x) <= .006 && Math.abs(tilt.y) <= .006) { tilt.x = tilt.y = 0; aimCamera(); moved = true; }
    if (paused) return;
    if (needs || moved) {
      if (lastDraw && real - lastDraw < 60) { slowFrames = real - lastDraw > 28 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames > 24 && dpr > DPR_MIN) { dpr = Math.max(DPR_MIN, dpr - .25); renderer.setPixelRatio(dpr); frame(); slowFrames = 0; needs = true; } }
      lastDraw = real;
    }
    if (needs) { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); needs = false; }   // the scene changed: refresh shadows too
    else if (moved) renderer.render(scene, camera);                                                         // only the view moved: shadows stay put
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
  renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); loop();

  return {
    el,
    update(nextBooks, nextView) {
      const before = new Set(books.map(b => b.id)), first = !primed; primed = true;
      books = nextBooks.slice(); view = nextView; rebuild();
      if (first) return;
      for (const b of books) if (!before.has(b.id)) {
        const p = findPivot(b.id); if (!p) continue;
        const row = rows.find(r => r.items.includes(p)), hx = p.userData.home.x;
        p.position.x = visW / 2 - (row ? row.group.position.x : 0) + 8;          // just off the right edge
        p.position.z = p.userData.home.z + 3;
        tween(p.position, 'x', hx, 620, 80); tween(p.position, 'z', p.userData.home.z, 260, 620);
        sfx.place();
      }
    },
    relayout() { if (frame()) rebuild(); },
    pushBack, focus,
    setLamps(v) { lamps = !!v; applyLamps(); },
    setAnchors(a) { anchors = a; placeAnchors(); },
    press: pressAnchor,
    pause(v) { paused = v; if (!v) needs = true; },
    destroy() { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
