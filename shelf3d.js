/* Bookie — the 3D bookcase.
   Three shelves fill one screen. Each shelf swipes sideways; tap a book to pull it out. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const BT = 2.0;      // board thickness
const HC = 25;       // clear height of a compartment
const PL = 9;        // plinth (kickboard) height
const DEPTH = 26;    // shelf depth
const H = PL + BT + 3 * (HC + BT);
const FOV = 24;
const ROWS = ['want', 'finished', 'reading'];          // bottom → top
const LABEL = { reading: 'READING NOW', finished: 'FINISHED', want: 'WANT TO READ' };

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
function brassCanvas(text) {
  const w = 512, h = 112, c = cnv(w, h), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e8cf8f'); g.addColorStop(.45, '#b88f45'); g.addColorStop(.55, '#a67d36'); g.addColorStop(1, '#d9bc78');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const hh = hash2(9); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(255,255,255,${hh(i, 1) * .08})`; x.fillRect(hh(i, 2) * w, hh(i, 3) * h, 20 * hh(i, 4), 1); }
  x.strokeStyle = 'rgba(80,55,20,.6)'; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4);
  x.fillStyle = '#6b4c1c'; [[16, h / 2], [w - 16, h / 2]].forEach(([cx, cy]) => { x.beginPath(); x.arc(cx, cy, 7, 0, 7); x.fill(); });
  x.font = '500 40px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,240,200,.55)'; x.fillText(text, w / 2, h / 2 + 2);
  x.fillStyle = '#3d2a0e'; x.fillText(text, w / 2, h / 2);
  return c;
}

/* ---------- the bookcase ---------- */
export async function createShelf3D(el, opts) {
  const { colorsOf, onPick, coverSrc } = opts;
  try { await Promise.all(['500 40px Fraunces', '500 20px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch { }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); scene.background = new THREE.Color('#b98a5c');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2000);

  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x6b4a2c, 0.7));
  const key = new THREE.DirectionalLight(0xffe6c8, 2.4); key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.radius = 7; key.shadow.blurSamples = 16;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xfff6ea, 0.8); fill.position.set(0, H * .45, 200); scene.add(fill);
  const rake = new THREE.DirectionalLight(0xfff0dc, 0.7); rake.position.set(160, H * .6, 70); scene.add(rake);

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (canvas, srgb = true, rep) => { const t = new THREE.CanvasTexture(canvas); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; if (rep) { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; } return t; };
  const oak = mapleCanvases(4, [236, 202, 156], [176, 128, 80], 2048, 256, { lines: 70, cathedral: .25, knots: 1, contrast: 1.35 });
  const walnut = mapleCanvases(9, [226, 186, 136], [168, 118, 70], 2048, 1024, { lines: 150, cathedral: .45, knots: 3, contrast: 1.3 });
  const boardMap = tex(oak.col, true, 1), boardBump = tex(oak.bump, false, 1);
  const backMap = tex(walnut.col, true, 1), backBump = tex(walnut.bump, false, 1);
  const clothTex = tex(clothCanvas(), false, 1); clothTex.repeat.set(3, 3);
  const pagesTex = tex(pagesCanvas());
  const pagesMat = new THREE.MeshStandardMaterial({ map: pagesTex, roughness: .92, metalness: 0 });
  const spineNormal = new THREE.CanvasTexture(spineNormalCanvas()); spineNormal.colorSpace = THREE.NoColorSpace; spineNormal.wrapT = THREE.RepeatWrapping;

  const caseGroup = new THREE.Group(), booksGroup = new THREE.Group(); scene.add(caseGroup, booksGroup);
  let visW = 50, rows = [], books = [], view = 'spines', needs = true, raf = 0, disposed = false, paused = false;
  const texCache = new Map(), coverCache = new Map(), tweens = [];
  const geoms = [];

  function frame() {
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return false;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const d = (H / 2) / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    camera.position.set(0, H / 2, d); camera.lookAt(0, H / 2, 0); camera.updateProjectionMatrix();
    visW = H * camera.aspect;
    return true;
  }
  function boardMat(lenU, depthU) {
    const m = new THREE.MeshStandardMaterial({ map: boardMap.clone(), bumpMap: boardBump.clone(), bumpScale: .6, roughness: .5, metalness: 0 });
    m.map.repeat.set(lenU / 110, depthU / 40); m.bumpMap.repeat.copy(m.map.repeat); m.map.needsUpdate = m.bumpMap.needsUpdate = true;
    return m;
  }
  function buildCase() {
    caseGroup.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => { m.map && m.map !== backMap && m.map.dispose?.(); m.dispose(); }); } });
    caseGroup.clear();
    const d = camera.position.z; const backScale = (d + DEPTH) / d;
    const W = visW * backScale + 8, BH = H * backScale + 20;
    // back panel
    const bm = new THREE.MeshStandardMaterial({ map: backMap, bumpMap: backBump, bumpScale: .25, roughness: .72 });
    bm.map.repeat.set(W / 150, 1); bm.bumpMap.repeat.copy(bm.map.repeat);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, BH), bm); back.position.set(0, H / 2, -DEPTH); back.receiveShadow = true; caseGroup.add(back);
    // soft occlusion in each compartment
    const aoTex = tex(aoCanvas(), false);
    for (let j = 0; j < 3; j++) {
      const base = PL + BT + j * (HC + BT);
      const ao = new THREE.Mesh(new THREE.PlaneGeometry(W, HC), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }));
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
      const lip = new THREE.Mesh(new THREE.CylinderGeometry(thick / 2, thick / 2, bw, 16, 1, true), boardMat(bw, 4));
      lip.rotation.z = Math.PI / 2; lip.scale.set(1, 1, .35); lip.position.set(0, m.position.y, 1); lip.receiveShadow = true; caseGroup.add(lip);
    });
    // side frame, like a real case
    const POST = 1.2;
    [-1, 1].forEach(sgn => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(POST, H + 10, DEPTH + 2), boardMat(H, DEPTH));
      post.material.color.set('#c99a6a'); post.material.map.rotation = Math.PI / 2; post.material.bumpMap.rotation = Math.PI / 2;
      post.position.set(sgn * (visW / 2 - POST / 2), H / 2, -DEPTH / 2 + .9); post.castShadow = post.receiveShadow = true; caseGroup.add(post);
    });
    // plinth
    const pm = new THREE.Mesh(new THREE.BoxGeometry(bw, PL, 3), boardMat(bw, 10)); pm.material.color.set('#c79a6a');
    pm.position.set(0, PL / 2, -1.2); pm.receiveShadow = true; caseGroup.add(pm);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(bw, 80), new THREE.MeshStandardMaterial({ color: '#7a5636', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 20); caseGroup.add(floor);
    // brass label plates
    ROWS.forEach((st, j) => {
      const y = PL + BT / 2 + j * (HC + BT);
      const n = books.filter(b => (b.status || 'reading') === st).length;
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.9),
        new THREE.MeshStandardMaterial({ map: tex(brassCanvas(`${LABEL[st]} · ${String(n).padStart(2, '0')}`)), metalness: .85, roughness: .32 }));
      plate.position.set(-visW / 2 + 1.2 + 1 + 5.5, y, 1.7); caseGroup.add(plate);
    });
    // light
    key.position.set(-visW * .22 - 6, H + 55, 150); key.target.position.set(0, H / 2, -DEPTH / 2);
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
    return { h: ht, t, d: ht * (f < .2 ? .62 : .67) };
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
    x.restore(); spineShading(x, w, h); return c;
  }
  function spineFromCover(b, dims, col, img) {
    const w = Math.max(48, Math.round(dims.t * PPU)), h = Math.round(dims.h * PPU);
    const c = cnv(w, h), x = c.getContext('2d');
    const iw = img.naturalWidth, ih = img.naturalHeight, sw = Math.max(2, Math.round(iw * .085));
    x.drawImage(img, 0, 0, sw, ih, 0, 0, w, h);             // the printed art wraps round to the spine
    const [r, g, bb] = avgColor(img, 0, sw);
    x.fillStyle = `rgba(${r | 0},${g | 0},${bb | 0},.6)`; x.fillRect(0, 0, w, h);
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * bb) / 255 > .55;
    const ink = light ? '#1d1a16' : '#f6efe2';
    const [ar, ag, ab] = avgColor(img, Math.round(iw * .3), Math.round(iw * .4));
    const acc = `rgb(${ar | 0},${ag | 0},${ab | 0})`;
    typeSpine(x, w, h, b, styleOf(b, w), ink, acc);
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
  function bookMesh(b, dims) {
    const c = colorsOf(b), col = { ...c, lumDark: c.fg !== '#1d1a16' };
    const hv = hashStr(b.id), jacket = hv % 3 !== 0;   // two in three books wear a glossy paper jacket
    const board = new THREE.MeshStandardMaterial({ color: shade(col.bg, .95), roughness: .78, bumpMap: clothTex, bumpScale: .5 });
    const spine = jacket
      ? new THREE.MeshPhysicalMaterial({ map: spineTex(b, dims, col), normalMap: spineNormal, normalScale: new THREE.Vector2(1, 1), roughness: .5, clearcoat: .35, clearcoatRoughness: .45 })
      : new THREE.MeshStandardMaterial({ map: spineTex(b, dims, col), normalMap: spineNormal, normalScale: new THREE.Vector2(.9, .9), roughness: .86, bumpMap: clothTex, bumpScale: .35 });
    const front = new THREE.MeshStandardMaterial({ map: coverTex(b, col), roughness: .62 });
    // order: +x (front cover), -x (back cover), +y top pages, -y bottom, +z spine, -z fore-edge
    const geo = new THREE.BoxGeometry(dims.t, dims.h, dims.d); geoms.push(geo);
    const m = new THREE.Mesh(geo, [front, board, pagesMat, pagesMat, spine, pagesMat]);
    m.castShadow = m.receiveShadow = true; m.userData.id = b.id;
    return m;
  }
  function buildBooks() {
    booksGroup.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => m !== pagesMat && m.dispose()); });
    geoms.forEach(g => g.dispose()); geoms.length = 0; booksGroup.clear();
    rows = ROWS.map((st, j) => {
      const base = PL + BT + j * (HC + BT);
      const list = books.filter(b => (b.status || 'reading') === st);
      if (st === 'finished') list.sort((a, b) => (b.finished || '').localeCompare(a.finished || ''));
      else if (st === 'reading') list.sort((a, b) => (b.started || '').localeCompare(a.started || ''));
      else list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const g = new THREE.Group(); booksGroup.add(g);
      const left = -visW / 2 + 1.2 + .35; let x = left; const items = [];
      list.forEach((b, i) => {
        const dims = dimsOf(b), mesh = bookMesh(b, dims), pivot = new THREE.Group();
        const hv = hashStr(b.id);
        if (view === 'covers') {
          // face-out, leaning back against the wall
          const tilt = new THREE.Group(); mesh.rotation.y = -Math.PI / 2; mesh.position.set(0, dims.h / 2, 0);
          tilt.add(mesh); tilt.rotation.x = -.11; pivot.add(tilt);
          pivot.position.set(x + dims.d / 2, base, -DEPTH + dims.t / 2 + 2.6);
          x += dims.d + .9;
        } else {
          mesh.position.set(dims.t / 2, dims.h / 2, 0);
          pivot.add(mesh);
          pivot.position.set(x, base, -1.6 - dims.d / 2 - (hv % 3) * .35);
          pivot.rotation.y = ((hv % 5) - 2) * .012;
          x += dims.t + .025 + (hv % 7 === 0 ? .12 : 0);
        }
        pivot.userData = { id: b.id, home: pivot.position.clone(), rot: pivot.rotation.clone() };
        g.add(pivot); items.push(pivot);
      });
      const contentW = x - left;
      // lean the last book if there is room
      if (view !== 'covers' && items.length > 1 && contentW < visW - 12) {
        const p = items[items.length - 1], m = p.children[0], dims = dimsOf(list[list.length - 1]);
        const prev = items[items.length - 2]; const prevRight = prev.position.x + dimsOf(list[list.length - 2]).t;
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
    const row = rowAt(e); drag = { x: e.clientX, y: e.clientY, t: performance.now(), row, last: e.clientX, lt: performance.now(), moved: false };
    if (row) row.vel = 0;
  });
  el.addEventListener('pointermove', e => {
    if (!drag) return; const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(e.clientY - drag.y)) { drag.moved = true; try { el.setPointerCapture(e.pointerId) } catch { } }
    if (drag.moved && drag.row) {
      const now = performance.now(), step = (e.clientX - drag.last) * pxToWorld();
      setOffset(drag.row, drag.row.offset + step, true);
      drag.row.vel = step / Math.max(1, now - drag.lt) * 16; drag.last = e.clientX; drag.lt = now;
    }
  });
  const end = e => {
    if (!drag) return; const d = drag; drag = null;
    if (!d.moved && performance.now() - d.t < 450 && e.type === 'pointerup') pick(e);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; const r = rowAt(e); if (!r) return; e.preventDefault(); setOffset(r, r.offset - e.deltaX * pxToWorld()) }, { passive: false });
  function setOffset(r, v, elastic) {
    const lo = r.min, hi = 0;
    if (elastic) { if (v > hi) v = hi + (v - hi) * .35; if (v < lo) v = lo + (v - lo) * .35; } else v = Math.max(lo, Math.min(hi, v));
    r.offset = v; r.group.position.x = v; needs = true;
  }
  let pulled = null;
  function pick(e) {
    toNDC(e); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(booksGroup.children, true)[0]; if (!hit) return;
    let p = hit.object; while (p && !p.userData?.home) p = p.parent; if (!p) return;
    pushBack(); pulled = p;
    tween(p.position, 'z', p.userData.home.z + (view === 'covers' ? 6 : 9), 260);
    tween(p.position, 'y', p.userData.home.y + .6, 260);
    setTimeout(() => onPick(p.userData.id), 230);
  }
  function pushBack() {
    if (!pulled) return; const p = pulled; pulled = null;
    tween(p.position, 'z', p.userData.home.z, 380); tween(p.position, 'y', p.userData.home.y, 380);
  }
  function tween(obj, prop, to, dur) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].obj === obj && tweens[i].prop === prop) tweens.splice(i, 1);
    tweens.push({ obj, prop, from: obj[prop], to, dur, start: performance.now() });
  }

  function loop() {
    if (disposed) return; raf = requestAnimationFrame(loop);
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i], k = Math.min(1, (now - t.start) / t.dur), e = 1 - Math.pow(1 - k, 3);
      t.obj[t.prop] = t.from + (t.to - t.from) * e; needs = true; if (k >= 1) tweens.splice(i, 1);
    }
    if (!drag || !drag.moved) for (const r of rows) {
      if (Math.abs(r.vel) > .002) { r.vel *= .93; setOffset(r, r.offset + r.vel, true); }
      else r.vel = 0;
      if (r.offset > 0 || r.offset < r.min) { const target = r.offset > 0 ? 0 : r.min; r.offset += (target - r.offset) * .18; if (Math.abs(target - r.offset) < .01) r.offset = target; r.group.position.x = r.offset; r.vel *= .5; needs = true; }
    }
    if (needs && !paused) { renderer.render(scene, camera); needs = false; }
  }

  const ro = new ResizeObserver(() => { if (frame()) { buildCase(); buildBooks(); } });
  ro.observe(el);
  frame(); buildCase(); buildBooks(); loop();

  return {
    el,
    update(nextBooks, nextView) {
      const offsets = rows.map(r => r.offset);
      books = nextBooks.slice(); view = nextView; pulled = null;
      buildCase(); buildBooks();
      rows.forEach((r, i) => setOffset(r, offsets[i] ?? 0));
    },
    pushBack,
    pause(v) { paused = v; if (!v) needs = true; },
    destroy() { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
