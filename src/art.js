// Every texture in the game is painted here on a 2D canvas at boot.
import { rnd, lerp } from './gfx.js';

const cv = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
};
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/** Momiji outline: 7 slender lobes, unit size, centre at origin, +y up, stem below. */
export function mapleOutline() {
  const lobes = [
    [-128, 0.46], [-88, 0.74], [-44, 0.92], [0, 1.0], [44, 0.92], [88, 0.74], [128, 0.46],
  ];
  const pts = [];
  const P = (deg, r) => { const a = (deg * Math.PI) / 180; return [Math.sin(a) * r, Math.cos(a) * r]; };
  pts.push(P(-176, 0.2));
  for (let i = 0; i < lobes.length; i++) {
    const [a, len] = lobes[i];
    if (i > 0) pts.push(P((a + lobes[i - 1][0]) / 2, 0.2 + 0.05 * Math.min(len, lobes[i - 1][1])));
    pts.push(P(a - 13, len * 0.42));
    pts.push(P(a - 5, len * 0.5));
    pts.push(P(a - 7, len * 0.72));
    pts.push(P(a, len));
    pts.push(P(a + 7, len * 0.72));
    pts.push(P(a + 5, len * 0.5));
    pts.push(P(a + 13, len * 0.42));
  }
  pts.push(P(176, 0.2));
  return pts;
}
const OUTLINE = mapleOutline();

function drawLeaf(g, x, y, size, rot, fill, vein, squash = 1) {
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(size, -size * squash);
  g.beginPath();
  OUTLINE.forEach(([px, py], i) => (i ? g.lineTo(px, py - 0.15) : g.moveTo(px, py - 0.15)));
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (vein) {
    g.strokeStyle = vein; g.lineWidth = 0.035; g.lineCap = 'round';
    g.beginPath();
    for (const a of [-128, -88, -44, 0, 44, 88, 128]) {
      const r = (a * Math.PI) / 180, len = a === 0 ? 0.86 : Math.abs(a) < 50 ? 0.78 : Math.abs(a) < 100 ? 0.6 : 0.36;
      g.moveTo(0, -0.12); g.lineTo(Math.sin(r) * len, Math.cos(r) * len - 0.15);
    }
    g.moveTo(0, -0.12); g.lineTo(0, -0.62);
    g.stroke();
  }
  g.restore();
}

/** Dense cluster of near-white leaves (tinted by vertex colour). Alpha-tested foliage card. */
export function leafCluster(seed = 3, n = 26, size = 512) {
  const [c, g] = cv(size, size);
  const r = rnd(seed);
  for (let i = 0; i < n; i++) {
    // biased to a rough disc so the card never reads as a square
    const ang = r() * Math.PI * 2, rad = Math.sqrt(r()) * size * 0.4;
    const x = size / 2 + Math.cos(ang) * rad, y = size / 2 + Math.sin(ang) * rad;
    const s = size * r.range(0.11, 0.19);
    const v = r.range(150, 255);
    const warm = r();
    drawLeaf(g, x, y, s, r() * Math.PI * 2,
      rgb(v, v * lerp(0.82, 1, warm), v * lerp(0.7, 0.95, warm)),
      rgb(v * 0.55, v * 0.4, v * 0.35, 0.55), r.range(0.55, 1));
  }
  return c;
}

export function leafSingle(size = 128) {
  const [c, g] = cv(size, size);
  drawLeaf(g, size / 2, size / 2, size * 0.47, 0, '#fff', 'rgba(120,70,40,0.5)');
  return c;
}

/** Leaf sprite with a painted gradient, for pickups / UI. */
export function leafGold(size = 256) {
  const [c, g] = cv(size, size);
  const gr = g.createLinearGradient(0, 0, size, size);
  gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.45, '#ffc93c'); gr.addColorStop(1, '#f08a24');
  drawLeaf(g, size / 2, size / 2, size * 0.47, 0, gr, 'rgba(160,80,10,0.55)');
  return c;
}

export function ballast(size = 512) {
  const [c, g] = cv(size, size);
  const r = rnd(11);
  g.fillStyle = '#5c5046'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 5200; i++) {
    const x = r() * size, y = r() * size, s = r.range(3, 9);
    const v = r.range(96, 196), w = r.range(-8, 16);
    g.fillStyle = rgb(v + w, v * 0.93, v * 0.84 - w);
    g.beginPath();
    g.ellipse(x, y, s, s * r.range(0.55, 0.9), r() * 3.14, 0, 6.3);
    g.fill();
    g.fillStyle = 'rgba(255,240,220,0.13)';
    g.beginPath(); g.ellipse(x - s * 0.2, y - s * 0.25, s * 0.5, s * 0.3, 0, 0, 6.3); g.fill();
  }
  // a few fallen leaves pressed into the stones
  for (let i = 0; i < 26; i++) {
    const pal = ['#c7361f', '#e0642a', '#f0a030', '#8e1f1a', '#f3c04a'];
    drawLeaf(g, r() * size, r() * size, r.range(9, 15), r() * 6.3, r.pick(pal), 'rgba(60,20,10,0.4)', r.range(0.6, 1));
  }
  return c;
}

/** Forest floor: dark soil almost hidden under fallen leaves. */
export function litter(size = 512) {
  const [c, g] = cv(size, size);
  const r = rnd(23);
  g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = rgb(r.range(40, 80), r.range(45, 70), r.range(20, 35), 0.5);
    g.beginPath(); g.ellipse(r() * size, r() * size, r.range(6, 30), r.range(4, 16), r() * 3, 0, 6.3); g.fill();
  }
  const pal = ['#a8261b', '#c93a1e', '#de5a23', '#ee8427', '#f2a737', '#f0c14e', '#7c1a18', '#b5542a', '#d9772c'];
  for (let i = 0; i < 1500; i++) {
    const x = r() * size, y = r() * size;
    for (const [ox, oy] of [[0, 0], [size, 0], [0, size], [-size, 0], [0, -size]]) {
      if (x + ox < -20 || x + ox > size + 20 || y + oy < -20 || y + oy > size + 20) continue;
      drawLeaf(g, x + ox, y + oy, r.range(8, 17), r() * 6.3, r.pick(pal), 'rgba(50,15,5,0.35)', r.range(0.5, 1));
    }
  }
  return c;
}

export function wood(w = 256, h = 512) {
  const [c, g] = cv(w, h);
  const r = rnd(5);
  const planks = 4, pw = w / planks;
  for (let p = 0; p < planks; p++) {
    const v = r.range(0.82, 1.05);
    g.fillStyle = rgb(196 * v, 150 * v, 104 * v); g.fillRect(p * pw, 0, pw, h);
    for (let i = 0; i < 70; i++) {
      const x = p * pw + r() * pw, a = r.range(0.04, 0.2);
      g.strokeStyle = r.chance(0.6) ? rgb(70, 40, 20, a) : rgb(255, 230, 190, a * 0.7);
      g.lineWidth = r.range(0.5, 2);
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + r.range(-4, 4), h * 0.3, x + r.range(-4, 4), h * 0.6, x + r.range(-2, 2), h);
      g.stroke();
    }
    for (let k = 0; k < 2; k++) if (r.chance(0.5)) {
      const kx = p * pw + r.range(12, pw - 12), ky = r() * h;
      g.fillStyle = 'rgba(70,40,22,0.55)'; g.beginPath(); g.ellipse(kx, ky, 5, 9, 0, 0, 6.3); g.fill();
    }
    g.fillStyle = 'rgba(30,15,8,0.6)'; g.fillRect(p * pw, 0, 2, h);
  }
  return c;
}

export function bark(size = 256) {
  const [c, g] = cv(size, size);
  const r = rnd(8);
  g.fillStyle = '#8c7868'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 520; i++) {
    const x = r() * size, y = r() * size, l = r.range(14, 70);
    const dark = r.chance(0.55);
    g.strokeStyle = dark ? rgb(38, 28, 24, r.range(0.25, 0.7)) : rgb(170, 150, 128, r.range(0.12, 0.4));
    g.lineWidth = r.range(1, 4.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-4, 4), y + l); g.stroke();
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rgb(120, 140, 80, r.range(0.1, 0.3));
    g.beginPath(); g.ellipse(r() * size, r() * size, r.range(4, 14), r.range(6, 22), 0, 0, 6.3); g.fill();
  }
  return c;
}

export function roofTile(size = 256) {
  const [c, g] = cv(size, size);
  const r = rnd(9);
  g.fillStyle = '#3c4048'; g.fillRect(0, 0, size, size);
  const rows = 8, cols = 8, th = size / rows, tw = size / cols;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = r.range(0.8, 1.15);
    const gr = g.createLinearGradient(x * tw, 0, (x + 1) * tw, 0);
    gr.addColorStop(0, rgb(40 * v, 44 * v, 52 * v)); gr.addColorStop(0.5, rgb(96 * v, 102 * v, 114 * v)); gr.addColorStop(1, rgb(34 * v, 38 * v, 46 * v));
    g.fillStyle = gr; g.fillRect(x * tw, y * th, tw, th);
    g.fillStyle = 'rgba(10,10,14,0.55)'; g.fillRect(x * tw, y * th + th - 3, tw, 3);
  }
  return c;
}

/** Standing rice seen from above: combed golden rows with dark gaps. */
export function paddy(size = 512) {
  const [c, g] = cv(size, size);
  const r = rnd(12);
  g.fillStyle = '#6b4f1c'; g.fillRect(0, 0, size, size);
  const rows = 16, rh = size / rows;
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * rh;
    for (let i = 0; i < 420; i++) {
      const x = r() * size, v = r.range(0.62, 1.15), l = r.range(7, 15), a = r.range(-0.5, 0.5);
      g.strokeStyle = rgb(240 * v, 196 * v, 84 * v, 0.95);
      g.lineWidth = r.range(1, 2.2);
      for (const ox of [0, size, -size]) { g.beginPath(); g.moveTo(x + ox, y + r.range(-4, 4)); g.lineTo(x + ox + Math.sin(a) * l, y - l * 0.7); g.stroke(); }
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = rgb(255, 232, 150, 0.8); g.beginPath(); g.ellipse(r() * size, y - rh * 0.3 + r.range(-3, 3), 2.2, 1.2, r() * 3, 0, 6.3); g.fill(); }
  }
  return c;
}

/** Harvested field: pale stubble dots in rows on dry earth. */
export function stubble(size = 512) {
  const [c, g] = cv(size, size);
  const r = rnd(14);
  g.fillStyle = '#8a6a44'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) { const v = r.range(0.7, 1.2); g.fillStyle = rgb(120 * v, 92 * v, 58 * v, 0.5); g.beginPath(); g.ellipse(r() * size, r() * size, r.range(3, 12), r.range(2, 7), r() * 3, 0, 6.3); g.fill(); }
  const rows = 16, rh = size / rows;
  for (let row = 0; row < rows; row++) for (let x = 6; x < size; x += 14) {
    const y = (row + 0.5) * rh + r.range(-2, 2), v = r.range(0.8, 1.15);
    g.fillStyle = 'rgba(40,26,12,0.5)'; g.beginPath(); g.ellipse(x + 2, y + 2, 5, 3.4, 0, 0, 6.3); g.fill();
    g.fillStyle = rgb(226 * v, 196 * v, 120 * v); g.beginPath(); g.ellipse(x + r.range(-1.5, 1.5), y, 4, 3, 0, 0, 6.3); g.fill();
  }
  return c;
}

/** Alpha card: a row of rice plants with drooping heads, side view. */
export function riceTuft(w = 256, h = 128) {
  const [c, g] = cv(w, h);
  const r = rnd(15);
  for (let i = 0; i < 150; i++) {
    const x = r.range(6, w - 6), top = r.range(8, 52), lean = r.range(-16, 16), v = r.range(0.7, 1.12);
    g.strokeStyle = rgb(232 * v, 190 * v, 80 * v); g.lineWidth = r.range(1.4, 2.8);
    g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, h * 0.5, x + lean, top); g.stroke();
    if (r.chance(0.55)) { // heavy seed head
      g.strokeStyle = rgb(250 * v, 214 * v, 110 * v); g.lineWidth = 3.6;
      g.beginPath(); g.moveTo(x + lean, top); g.quadraticCurveTo(x + lean * 1.6, top + 4, x + lean * 1.9, top + 20); g.stroke();
    }
  }
  return c;
}

/** Water height field: overlapping soft ripples, tileable. Turned into a normal map by normalFrom(). */
export function waterHeight(size = 256) {
  const [c, g] = cv(size, size);
  const r = rnd(31);
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const x = r() * size, y = r() * size, rx = r.range(10, 44), ry = r.range(3, 9), up = r.chance(0.5), a = r.range(-0.25, 0.25);
    for (const ox of [0, size, -size]) for (const oy of [0, size, -size]) {
      const cx = x + ox, cy = y + oy;
      if (cx < -50 || cx > size + 50 || cy < -20 || cy > size + 20) continue;
      g.save(); g.translate(cx, cy); g.rotate(a); g.scale(1, ry / rx);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      gr.addColorStop(0, up ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.34)'); gr.addColorStop(1, up ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 6.3); g.fill(); g.restore();
    }
  }
  return c;
}

/** Tangent-space normal map from the luminance of a (tileable) canvas. */
export function normalFrom(src, strength = 2) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const H = (x, y) => { const i = (((y + h) % h) * w + ((x + w) % w)) * 4; return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; };
  const [c, g] = cv(w, h);
  const out = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** Foam / shallows sprite: a soft irregular ring. */
export function foam(size = 128) {
  const [c, g] = cv(size, size);
  const r = rnd(44);
  for (let i = 0; i < 260; i++) {
    const a = r() * 6.283, rad = size * r.range(0.3, 0.47);
    g.fillStyle = rgb(255, 255, 255, r.range(0.08, 0.4));
    g.beginPath(); g.ellipse(size / 2 + Math.cos(a) * rad, size / 2 + Math.sin(a) * rad, r.range(2, 9), r.range(1.5, 5), a + 1.57, 0, 6.3); g.fill();
  }
  return c;
}

/**
 * Equirect environment for reflections: the painted sky above, a band of autumn forest on the horizon,
 * dark leaf-litter below.
 */
export function envMap(skyCanvas, flip = false, w = 1024, h = 512) {
  const [c, g] = cv(w, h);
  g.drawImage(skyCanvas, 0, 0, w, h);
  const r = rnd(61);
  const gr = g.createLinearGradient(0, h * 0.47, 0, h);
  gr.addColorStop(0, '#8a3a1e'); gr.addColorStop(0.2, '#5a2a18'); gr.addColorStop(1, '#2a1a12');
  g.fillStyle = gr; g.fillRect(0, h * 0.47, w, h * 0.53);
  const pal = ['#b02a1a', '#d4481e', '#e8802a', '#f0aa3a', '#7a1c16', '#c05a22'];
  for (let i = 0; i < 1400; i++) {
    const x = r() * w, y = h * r.range(0.435, 0.51), s = r.range(4, 11);
    g.fillStyle = r.pick(pal); g.globalAlpha = r.range(0.5, 0.95);
    for (const ox of [0, w, -w]) { g.beginPath(); g.ellipse(x + ox, y, s, s * 0.8, 0, 0, 6.3); g.fill(); }
  }
  g.globalAlpha = 1;
  if (!flip) return c;
  const [c2, g2] = cv(w, h);
  g2.translate(0, h); g2.scale(1, -1); g2.drawImage(c, 0, 0);
  return c2;
}

/** Water colour: deep teal with slow darker currents, tileable. */
export function water(size = 256) {
  const [c, g] = cv(size, size);
  const r = rnd(33);
  g.fillStyle = '#86b4c6'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = r() * size, y = r() * size, rx = r.range(30, 90), ry = r.range(8, 22);
    g.fillStyle = r.chance(0.5) ? rgb(170, 214, 222, 0.2) : rgb(70, 120, 150, 0.2);
    for (const ox of [0, size, -size]) for (const oy of [0, size, -size]) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, 0, 0, 6.3); g.fill(); }
  }
  return c;
}

export function stripes(a = '#f4c20d', b = '#1c1c1c', size = 128) {
  const [c, g] = cv(size, size);
  g.fillStyle = a; g.fillRect(0, 0, size, size);
  g.fillStyle = b;
  for (let i = -2; i < 4; i++) {
    g.beginPath();
    const x = i * (size / 2);
    g.moveTo(x, size); g.lineTo(x + size / 4, size); g.lineTo(x + size / 4 + size, 0); g.lineTo(x + size, 0); g.closePath(); g.fill();
  }
  return c;
}

export function plaster(size = 256) {
  const [c, g] = cv(size, size);
  const r = rnd(41);
  g.fillStyle = '#efe6d4'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r.chance(0.5) ? rgb(120, 100, 80, r.range(0.02, 0.08)) : rgb(255, 255, 255, r.range(0.03, 0.12));
    g.beginPath(); g.ellipse(r() * size, r() * size, r.range(2, 18), r.range(2, 10), r() * 3, 0, 6.3); g.fill();
  }
  return c;
}

/** Sign atlas: 4 rows x 1 col of 512x128 panels. Row order must match SIGN_UV in world.js. */
export function signs() {
  const [c, g] = cv(512, 512);
  const row = (i, bg, draw) => { g.save(); g.translate(0, i * 128); g.fillStyle = bg; g.fillRect(0, 0, 512, 128); draw(); g.restore(); };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const jp = '"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
  const sans = '"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif';
  // 0: station name board
  row(0, '#f7f1e3', () => {
    g.fillStyle = '#1d1a17'; g.font = `700 62px ${jp}`; g.fillText('紅葉谷', 256, 48);
    g.font = `600 20px ${sans}`; g.fillText('M O M I J I D A N I', 256, 96);
    g.fillStyle = '#b3261e'; g.fillRect(24, 110, 464, 7);
    g.font = `500 17px ${sans}`; g.fillStyle = '#5a5148';
    g.textAlign = 'left'; g.fillText('← かえで橋', 26, 22); g.textAlign = 'right'; g.fillText('もみじ湖 →', 486, 22); g.textAlign = 'center';
  });
  // 1: overhead warning (roll under)
  row(1, '#f4c20d', () => {
    g.fillStyle = '#1c1c1c'; g.font = `800 66px ${sans}`; g.fillText('頭上注意', 256, 68);
    g.fillRect(0, 0, 512, 10); g.fillRect(0, 118, 512, 10);
  });
  // 2: destination blind
  row(2, '#15120e', () => {
    g.fillStyle = '#ffb347'; g.font = `700 64px ${sans}`; g.fillText('紅葉ライン', 256, 68);
  });
  // 3: crossing / stop sign
  row(3, '#b3261e', () => {
    g.fillStyle = '#fff6e6'; g.font = `800 62px ${sans}`; g.fillText('とまれ　見よ', 256, 68);
  });
  return c;
}

export function glow(size = 128, hard = 0.0) {
  const [c, g] = cv(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

export function blobShadow(size = 128) {
  const [c, g] = cv(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

/** Soft vertical shaft for sun rays. */
export function shaft(w = 64, h = 256) {
  const [c, g] = cv(w, h);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ax = Math.sin((x / (w - 1)) * Math.PI) ** 1.6;
    const ty = y / (h - 1);
    const ay = Math.sin(ty * Math.PI) ** 0.7 * (1 - ty * 0.35);
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = 255 * ax * ay;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Equirect-ish sky: u = azimuth (sun at u=0.5), v = 0 zenith .. 1 below horizon. */
export function sky(w = 2048, h = 1024, sunU = 0.5, sunV = 0.36) {
  const [c, g] = cv(w, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0.0, '#123a94');
  gr.addColorStop(0.2, '#2562c0');
  gr.addColorStop(0.34, '#4a8ad8');
  gr.addColorStop(0.42, '#86b4e2');
  gr.addColorStop(0.47, '#f0c08a');
  gr.addColorStop(0.5, '#ffb46a');
  gr.addColorStop(0.56, '#e89a66');
  gr.addColorStop(1, '#d88a5c');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const sx = sunU * w, sy = sunV * h;
  // warm bloom around the sun, wrapped horizontally
  for (const ox of [0, w, -w]) {
    let rg = g.createRadialGradient(sx + ox, sy, 0, sx + ox, sy, w * 0.33);
    rg.addColorStop(0, 'rgba(255,236,190,0.95)'); rg.addColorStop(0.12, 'rgba(255,214,150,0.6)');
    rg.addColorStop(0.45, 'rgba(255,170,110,0.2)'); rg.addColorStop(1, 'rgba(255,160,100,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    rg = g.createRadialGradient(sx + ox, sy, 0, sx + ox, sy, 46);
    rg.addColorStop(0, 'rgba(255,255,244,1)'); rg.addColorStop(0.5, 'rgba(255,250,225,1)'); rg.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = rg; g.fillRect(sx + ox - 60, sy - 60, 120, 120);
  }
  // clouds: stretched, lit from the sun side
  const r = rnd(77);
  for (let i = 0; i < 46; i++) {
    const cx = r() * w, cy = h * r.range(0.14, 0.44), len = r.range(120, 420), th = r.range(10, 34) * (0.5 + (cy / h) * 0.9);
    const near = 1 - Math.min(1, Math.abs(((cx / w - sunU + 1.5) % 1) - 0.5) * 2.4);
    for (let k = 0; k < 16; k++) {
      const px = cx + r.range(-len / 2, len / 2), py = cy + r.range(-th / 2, th / 2);
      const rr = r.range(th * 0.8, th * 2.2);
      for (const ox of [0, w, -w]) {
        const rg = g.createRadialGradient(px + ox, py, 0, px + ox, py, rr * 2.4);
        rg.addColorStop(0, rgb(255, lerp(206, 236, near), lerp(190, 196, near), 0.3));
        rg.addColorStop(1, rgb(255, 200, 170, 0));
        g.fillStyle = rg;
        g.beginPath(); g.ellipse(px + ox, py, rr * 2.4, rr, 0, 0, 6.3); g.fill();
      }
    }
  }
  return c;
}

/** Tileable mountain silhouette ring, alpha outside the ridge. */
export function ridge(seed, base, top, w = 2048, h = 256, rough = 1, trees = false) {
  const [c, g] = cv(w, h);
  const r = rnd(seed);
  const ph = [r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3];
  const H = (x) => {
    const t = (x / w) * Math.PI * 2;
    return h * (0.5 - 0.2 * rough * Math.sin(t * 2 + ph[0]) - 0.13 * rough * Math.sin(t * 5 + ph[1]) - 0.07 * Math.sin(t * 11 + ph[2])
      - 0.035 * Math.sin(t * 23 + ph[3]) - 0.015 * Math.sin(t * 47 + ph[4]));
  };
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, top); gr.addColorStop(1, base);
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 2) g.lineTo(x, H(x));
  g.lineTo(w, h); g.closePath(); g.fill();
  if (trees) {
    // mottled autumn canopy on the near ridge
    const pal = ['#a02a1c', '#c8451f', '#e07a26', '#eda33a', '#7a1f1a', '#b8652a', '#59602a'];
    g.save(); g.clip();
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = H(x) + r() * (h - H(x));
      const s = r.range(5, 13);
      g.fillStyle = r.pick(pal); g.globalAlpha = r.range(0.35, 0.8);
      for (const ox of [0, w, -w]) { g.beginPath(); g.ellipse(x + ox, y, s, s * 0.8, 0, 0, 6.3); g.fill(); }
    }
    g.restore();
  }
  return c;
}

export { drawLeaf };

/** Rects (px) of the station / house decal atlas painted by deco(). */
export const DECO = {
  clock: [0, 0, 256, 256], vend: [256, 0, 256, 448], timetable: [512, 0, 512, 256],
  shoji: [0, 256, 256, 256], noren: [512, 256, 512, 192], window: [512, 448, 256, 256],
  door: [768, 448, 256, 384], kippu: [0, 512, 512, 128], p1: [0, 640, 128, 128], p2: [128, 640, 128, 128],
  poster: [256, 640, 256, 320], post: [0, 768, 128, 128], glass: [512, 704, 256, 256], exit: [0, 896, 256, 128],
};

/** Decal atlas (1024²): clock, vending machine, timetable, shoji, noren, windows, doors, small signs. */
export function deco() {
  const [c, g] = cv(1024, 1024);
  const r = rnd(77);
  const jp = '"Shippori Mincho B1","Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
  const sans = '"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",sans-serif';
  const cell = (k, fn) => { const [x, y, w, h] = DECO[k]; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); fn(w, h); g.restore(); };
  g.textAlign = 'center'; g.textBaseline = 'middle';

  cell('clock', (w, h) => {
    g.fillStyle = '#2a211b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6efdf'; g.beginPath(); g.arc(128, 128, 112, 0, 6.3); g.fill();
    g.strokeStyle = '#1c1714'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 112, 0, 6.3); g.stroke();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * 6.283, big = i % 5 === 0, r0 = big ? 86 : 98;
      g.lineWidth = big ? 7 : 2; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 104, 128 - Math.cos(a) * 104); g.stroke();
    }
    const hand = (a, len, lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(128 - Math.sin(a) * 14, 128 + Math.cos(a) * 14); g.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); g.stroke(); };
    hand(4.9 * 0.5236 + 0.35, 58, 11, '#1c1714'); hand(8.4 * 0.5236, 88, 7, '#1c1714'); hand(1.9, 92, 3, '#b3261e');
    g.fillStyle = '#1c1714'; g.beginPath(); g.arc(128, 128, 9, 0, 6.3); g.fill();
  });

  cell('vend', (w, h) => {
    g.fillStyle = '#c7352a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f7f3ea'; g.fillRect(14, 14, w - 28, 238);
    const cols = ['#e2512d', '#f0b21c', '#2f7d4f', '#2a5fa8', '#7a3f2a', '#f4f0e6', '#e88aa0', '#1d1a17'];
    for (let row = 0; row < 3; row++) {
      g.fillStyle = '#d9d2c2'; g.fillRect(14, 14 + row * 79 + 62, w - 28, 17);
      for (let i = 0; i < 7; i++) {
        const x = 24 + i * 30.5, y = 22 + row * 79, col = r.pick(cols);
        g.fillStyle = col; g.fillRect(x, y + 8, 22, 44); g.fillRect(x + 6, y, 10, 10);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 3, y + 22, 16, 12);
        g.fillStyle = r.chance(0.3) ? '#d0342c' : '#2a5fa8'; g.fillRect(x + 4, y + 59, 14, 7);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(14, 14); g.lineTo(120, 14); g.lineTo(40, 252); g.lineTo(14, 252); g.fill();
    g.fillStyle = '#1d1a17'; g.fillRect(170, 268, 62, 84);
    g.fillStyle = '#c9c4b8'; g.fillRect(180, 278, 42, 10); g.fillRect(180, 300, 18, 26); g.fillStyle = '#58e07a'; g.fillRect(204, 300, 18, 8);
    g.fillStyle = '#fff6e6'; g.font = `800 34px ${sans}`; g.textAlign = 'left'; g.fillText('お茶', 22, 296); g.font = `600 17px ${sans}`; g.fillText('つめた〜い', 22, 332); g.textAlign = 'center';
    g.fillStyle = '#1d1a17'; g.fillRect(28, 372, w - 56, 54); g.fillStyle = '#3a3531'; g.fillRect(36, 380, w - 72, 38);
  });

  cell('timetable', (w, h) => {
    g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#23405e'; g.fillRect(0, 0, w, 46);
    g.fillStyle = '#fff6e6'; g.font = `700 28px ${sans}`; g.fillText('時刻表　紅葉ライン', w / 2, 24);
    g.font = `600 15px ${sans}`;
    for (let col = 0; col < 2; col++) for (let row = 0; row < 9; row++) {
      const x = 14 + col * 250, y = 56 + row * 21.5;
      g.fillStyle = row % 2 ? '#efe6d2' : '#f7f1e3'; g.fillRect(x, y, 236, 21.5);
      g.fillStyle = col ? '#b3261e' : '#23405e'; g.fillRect(x, y, 34, 21.5);
      g.fillStyle = '#fff6e6'; g.fillText(String(6 + row + col * 9 > 23 ? row : 6 + row + col * 9), x + 17, y + 11);
      g.fillStyle = '#1d1a17';
      const n = r.int(1, 4); for (let i = 0; i < n; i++) g.fillText(String(r.int(0, 5)) + String(r.int(0, 9)), x + 62 + i * 46, y + 11);
    }
    g.strokeStyle = '#23405e'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });

  cell('shoji', (w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff4d8'); gr.addColorStop(1, '#f6dca6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,170,70,0.22)'; g.beginPath(); g.ellipse(w / 2, h * 0.55, w * 0.5, h * 0.42, 0, 0, 6.3); g.fill();
    g.fillStyle = '#4a3324';
    g.fillRect(0, 0, w, 12); g.fillRect(0, h - 20, w, 20); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); g.fillRect(w / 2 - 6, 0, 12, h);
    for (let i = 1; i < 5; i++) g.fillRect(0, 12 + i * (h - 32) / 5 - 2, w, 4);
    for (const x of [w * 0.25, w * 0.75]) g.fillRect(x - 2, 0, 4, h);
  });

  cell('noren', (w, h) => {
    g.fillStyle = '#1f3352'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${r.range(0.01, 0.05)})`; g.fillRect(r() * w, r() * h, r.range(20, 80), 1); }
    g.fillStyle = '#f4ecd8'; g.font = `700 104px ${jp}`;
    ['紅', '葉', '谷', '駅'].forEach((ch, i) => g.fillText(ch, 64 + i * 128, h * 0.5));
    g.fillStyle = '#0d1522'; for (let i = 1; i < 4; i++) g.fillRect(i * 128 - 3, h * 0.3, 6, h);
    g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, w, 12);
  });

  cell('window', (w, h) => { // kōshi lattice window, lamp-lit from inside
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe2a0'); gr.addColorStop(1, '#f2a84c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a271b'; for (let x = 0; x < w; x += 21.3) g.fillRect(x, 0, 9, h);
    g.fillRect(0, 0, w, 16); g.fillRect(0, h - 18, w, 18); g.fillRect(0, h * 0.5 - 4, w, 8); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
  });

  cell('door', (w, h) => { // sliding door: glazed top, boarded bottom
    g.fillStyle = '#5a3d2a'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = `rgba(0,0,0,${r.range(0.03, 0.14)})`; g.fillRect(x, 0, 14, h); }
    for (const x0 of [10, w / 2 + 4]) {
      const pw = w / 2 - 14;
      const gr = g.createLinearGradient(0, 14, 0, 230); gr.addColorStop(0, '#f7e3ae'); gr.addColorStop(1, '#e9b866');
      g.fillStyle = gr; g.fillRect(x0, 14, pw, 220);
      g.fillStyle = '#3a271b'; for (let i = 1; i < 3; i++) g.fillRect(x0 + (i * pw) / 3 - 2, 14, 4, 220); for (let i = 1; i < 4; i++) g.fillRect(x0, 14 + i * 55 - 2, pw, 4);
    }
    g.fillStyle = '#2a1c14'; g.fillRect(0, 0, w, 10); g.fillRect(w / 2 - 5, 0, 10, h); g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#c9a24a'; g.fillRect(w / 2 - 22, 262, 8, 30); g.fillRect(w / 2 + 14, 262, 8, 30);
  });

  cell('kippu', (w, h) => {
    g.fillStyle = '#23405e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f4ecd8'; g.lineWidth = 5; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = '#f4ecd8'; g.font = `800 62px ${sans}`; g.fillText('きっぷうりば', w / 2, h * 0.44);
    g.font = `600 19px ${sans}`; g.fillText('T I C K E T S', w / 2, h * 0.8);
  });

  for (const [k, n, col] of [['p1', '1', '#23405e'], ['p2', '2', '#b3261e']]) cell(k, (w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6e6'; g.font = `800 92px ${sans}`; g.fillText(n, w / 2, h * 0.5);
    g.font = `700 18px ${sans}`; g.fillText('のりば', w / 2, h * 0.88);
  });

  cell('poster', (w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f9d48a'); gr.addColorStop(0.6, '#ef8a3a'); gr.addColorStop(1, '#a8281c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff3d6'; g.beginPath(); g.arc(w * 0.68, h * 0.3, 44, 0, 6.3); g.fill();
    g.fillStyle = '#7a1a16'; g.beginPath(); g.moveTo(0, h * 0.74); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.66 - Math.sin(x * 0.03) * 22 - Math.sin(x * 0.11) * 7); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#1d1a17'; g.fillRect(0, h * 0.8, w, 8); for (let x = 0; x < w; x += 22) g.fillRect(x, h * 0.8, 6, 22);
    g.fillStyle = '#fff6e6'; g.font = `700 50px ${jp}`; g.save(); g.translate(46, h * 0.36); ['秋', 'の', '旅'].forEach((ch, i) => g.fillText(ch, 0, (i - 1) * 56)); g.restore();
    g.font = `600 15px ${sans}`; g.fillText('MOMIJI LINE', w / 2, h - 20);
    g.strokeStyle = '#fff6e6'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });

  cell('post', (w, h) => {
    g.fillStyle = '#c7352a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6e6'; g.font = `800 82px ${sans}`; g.fillText('〒', w / 2, h * 0.45);
    g.fillStyle = '#1d1a17'; g.fillRect(22, h - 30, w - 44, 12);
  });

  cell('glass', (w, h) => { // daytime window: sky-dark glass in a timber frame
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5d7286'); gr.addColorStop(0.5, '#27323c'); gr.addColorStop(1, '#3d4a55');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,240,210,0.18)'; g.beginPath(); g.moveTo(0, h * 0.7); g.lineTo(w * 0.7, 0); g.lineTo(w, 0); g.lineTo(w * 0.2, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#f1e7d2'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 16, w, 16); g.fillRect(0, 0, 12, h); g.fillRect(w - 12, 0, 12, h); g.fillRect(w / 2 - 5, 0, 10, h); g.fillRect(0, h / 2 - 4, w, 8);
  });

  cell('exit', (w, h) => {
    g.fillStyle = '#f4c20d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1c1c1c'; g.font = `800 64px ${sans}`; g.fillText('出口', w * 0.36, h * 0.52);
    g.font = `800 54px ${sans}`; g.fillText('→', w * 0.8, h * 0.5);
  });
  return c;
}

/** Thatch: combed straw running down the roof slope (v), tiling. */
export function thatch(size = 256) {
  const [c, g] = cv(size, size);
  const r = rnd(58);
  g.fillStyle = '#8a7350'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = r() * size, y = r() * size, len = r.range(14, 60), v = r.range(0.55, 1.25);
    g.strokeStyle = rgb(150 * v, 124 * v, 82 * v, r.range(0.25, 0.7)); g.lineWidth = r.range(0.6, 1.8);
    for (const oy of [0, -size, size]) { g.beginPath(); g.moveTo(x, y + oy); g.lineTo(x + r.range(-2.5, 2.5), y + oy + len); g.stroke(); }
  }
  for (let y = 0; y < size; y += size / 4) { // trimmed courses
    const gr = g.createLinearGradient(0, y, 0, y + 14); gr.addColorStop(0, 'rgba(30,20,10,0.45)'); gr.addColorStop(1, 'rgba(30,20,10,0)');
    g.fillStyle = gr; g.fillRect(0, y, size, 14);
  }
  return c;
}
