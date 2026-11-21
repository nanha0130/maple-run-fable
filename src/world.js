// Scenery: 40 m chunks in four biomes (maple tunnel, harvest paddies, timber station, vermilion truss bridge),
// plus the sky dome, far ridges and river that follow the camera.
import * as pc from 'playcanvas';
import { Geo, rnd, clamp, lerp, smooth, hex, mix, shade, mat, canvasTexture, entityFromGeos } from './gfx.js';
import * as art from './art.js';

export const LANE_W = 3.2;
export const LANES = [-LANE_W, 0, LANE_W];
export const CHUNK = 40;
export const TRAIN_TOP = 3.52;

// direction TO the sun: ahead of the runner (‑Z) and to the left, low in the sky
const sunRaw = [-0.5, 0.42, -0.76];
const sl = Math.hypot(...sunRaw);
export const SUN = sunRaw.map((v) => v / sl);
export const FOG = hex('#f3c49c');

const CYCLE = [
  'forest', 'forest', 'forest', 'forest', 'forest',
  'paddy', 'paddy', 'paddy', 'paddy',
  'forest', 'forest', 'forest',
  'bridge', 'bridge', 'bridge',
  'forest', 'forest', 'forest', 'forest',
  'station', 'station',
];
export function biomeOf(k) {
  if (k <= -3) return 'forest';
  if (k <= 0) return 'station';
  return CYCLE[(k - 1) % CYCLE.length];
}
export const biomeAt = (s) => biomeOf(Math.floor(s / CHUNK));
// How much direct sun reaches the runner on each kind of stretch (the splat characters are lit apart from the scene
// and take no shadows from it, so their light has to follow where they are).
const SUNLIT = { forest: 0, station: 0.2, paddy: 1, bridge: 0.7 };
/** 0..1, continuous: each chunk's value sits at its middle and eases into the next over a whole chunk (40 m). */
export function sunAt(s) {
  const f = s / CHUNK - 0.5, k = Math.floor(f), t = f - k, e = t * t * (3 - 2 * t);
  return SUNLIT[biomeOf(k)] * (1 - e) + SUNLIT[biomeOf(k + 1)] * e;
}

const PROFILES = {
  forest: [[5.4, 0], [6.6, -0.5], [9, 0.5], [14, 1.8], [24, 4], [45, 8], [120, 17]],
  paddy: [[5.4, 0], [6.6, -0.5], [8, -0.75], [64, -0.75], [84, 2.5], [120, 10]],
  station: [[5.4, 0], [6.6, -0.5], [13, -0.5], [19, 1], [30, 3.5], [120, 15]],
  bridge: [[5.4, 0], [5.9, 0], [6.4, -11.5], [120, -11.5]],
};
function profile(b, a) {
  const p = PROFILES[b];
  if (a <= p[0][0]) return 0;
  for (let i = 1; i < p.length; i++) if (a <= p[i][0]) return lerp(p[i - 1][1], p[i][1], (a - p[i - 1][0]) / (p[i][0] - p[i - 1][0]));
  return p[p.length - 1][1];
}
const BLEND = 16;
export function groundY(x, s) {
  const a = Math.abs(x);
  if (a <= 5.4) return 0;
  const k = Math.floor(s / CHUNK);
  const b = biomeOf(k), pb = biomeOf(k - 1);
  let y = profile(b, a);
  const t = (s - k * CHUNK) / BLEND;
  if (pb !== b && t < 1) y = lerp(profile(pb, a), y, smooth(t));
  if (y > -9 && a > 7) y += (Math.sin(x * 0.31 + s * 0.17) + Math.sin(x * 0.13 - s * 0.23 + 1.7)) * Math.min(b === 'paddy' ? 0.35 : 1.4, (a - 7) * 0.05) * (b === 'paddy' && a < 64 ? 0 : 1);
  return y;
}

// ---------- palettes ----------
const P = (base, dark, light) => ({ base: hex(base), dark: hex(dark), light: hex(light) });
const PAL = {
  crimson: P('#c22a1c', '#6a1212', '#f0582a'),
  scarlet: P('#dc4420', '#861c14', '#f7862e'),
  orange: P('#ea7a22', '#983816', '#f9b23c'),
  amber: P('#f0a630', '#a65818', '#fcd65c'),
  gold: P('#f2c53c', '#ae781c', '#fde97c'),
  wine: P('#9a1f24', '#4a0e15', '#d03c2a'),
  green: P('#a8a23a', '#565c20', '#d8c850'),
};
const PAL_BAG = ['crimson', 'crimson', 'crimson', 'scarlet', 'scarlet', 'scarlet', 'orange', 'orange', 'orange', 'amber', 'amber', 'wine', 'gold', 'green'];
const BARK = hex('#bca894');
const BARK_D = hex('#8a7462');
const VERMILION = hex('#d6402a');
const TIMBER = hex('#6b4a34');
const TIMBER_D = hex('#3f2a1e');
const STEEL = hex('#8d8a88');
const CONCRETE = hex('#b9b2a6');
const STONE = hex('#6f6860');

const ENV_FLIP = new URLSearchParams(location.search).has('envflip'); // debug: flip the reflection map

// ---------- materials ----------
export function createMaterials(device) {
  const T = (c, o) => canvasTexture(device, c, o);
  const leafAtlas = document.createElement('canvas');
  leafAtlas.width = 1024; leafAtlas.height = 512;
  const lg = leafAtlas.getContext('2d');
  lg.drawImage(art.leafCluster(3, 26), 0, 0);
  lg.drawImage(art.leafCluster(9, 20), 512, 0);
  const skyCanvas = art.sky();
  const tx = {
    leaf: T(leafAtlas, { clamp: true, aniso: 2 }),
    leaf1: T(art.leafSingle(), { clamp: true }),
    leafGold: T(art.leafGold(), { clamp: true }),
    ballast: T(art.ballast(), { aniso: 8 }),
    litter: T(art.litter(), { aniso: 8 }),
    wood: T(art.wood(), { aniso: 4 }),
    bark: T(art.bark()),
    tile: T(art.roofTile(), { aniso: 4 }),
    paddy: T(art.paddy(), { aniso: 8 }),
    plaster: T(art.plaster()),
    water: T(art.water(), { aniso: 8 }),
    waterN: T(art.normalFrom(art.waterHeight(), 5), { linear: true, aniso: 8 }),
    ballastN: T(art.normalFrom(art.ballast(), 3.2), { linear: true, aniso: 8 }),
    tileN: T(art.normalFrom(art.roofTile(), 2.5), { linear: true, aniso: 4 }),
    woodN: T(art.normalFrom(art.wood(), 1.6), { linear: true, aniso: 4 }),
    stubble: T(art.stubble(), { aniso: 8 }),
    rice: T(art.riceTuft(), { clampV: true, aniso: 4 }),
    foam: T(art.foam(), { clamp: true }),
    signs: T(art.signs(), { clamp: true, aniso: 4 }),
    deco: T(art.deco(), { clamp: true, aniso: 4 }),
    thatch: T(art.thatch(), { aniso: 4 }),
    hazard: T(art.stripes('#f4c20d', '#1c1c1c')),
    redwhite: T(art.stripes('#f4f0e6', '#d0342c')),
    glow: T(art.glow(), { clamp: true }),
    shadow: T(art.blobShadow(), { clamp: true }),
    shaft: T(art.shaft(), { clamp: true }),
    sky: T(skyCanvas, { clampV: true, mipmaps: false }),
    env: T(art.envMap(skyCanvas, ENV_FLIP), { clampV: true, mipmaps: false }),
    ridgeFar: T(art.ridge(5, '#c9b3b4', '#8f9cc0', 2048, 256, 1.0), { clampV: true }),
    ridgeMid: T(art.ridge(19, '#d9a98e', '#a98a9a', 2048, 256, 0.8), { clampV: true }),
    ridgeNear: T(art.ridge(42, '#c8794e', '#9c4a34', 2048, 256, 0.55, true), { clampV: true }),
  };
  const m = {
    ballast: mat({ map: tx.ballast, vc: true, gloss: 0.22, normalMap: tx.ballastN, bump: 1 }),
    litter: mat({ map: tx.litter, vc: true, gloss: 0.05 }),
    paddy: mat({ map: tx.paddy, vc: true, gloss: 0.05 }),
    stubble: mat({ map: tx.stubble, vc: true, gloss: 0.05 }),
    rice: mat({ map: tx.rice, vc: true, alphaTest: 0.35, twoSided: true, gloss: 0.1, emissiveVc: true, emissiveMap: tx.rice, emissive: [1, 1, 1], emissiveIntensity: 0.3, noShadow: true }),
    foam: mat({ map: tx.foam, blend: 'alpha', unlit: true, emissiveMap: tx.foam, emissive: [1, 0.95, 0.88], emissiveIntensity: 0.9, color: [0, 0, 0], twoSided: true }),
    wood: mat({ map: tx.wood, vc: true, gloss: 0.3, normalMap: tx.woodN, bump: 0.8 }),
    bark: mat({ map: tx.bark, vc: true, gloss: 0.05 }),
    leaf: mat({ map: tx.leaf, vc: true, alphaTest: 0.42, twoSided: true, gloss: 0.1, emissiveVc: true, emissiveMap: tx.leaf, emissive: [1, 1, 1], emissiveIntensity: 0.36 }),
    flat: mat({ vc: true, gloss: 0.12 }),
    shiny: mat({ vc: true, gloss: 0.8, env: true }),
    tile: mat({ map: tx.tile, vc: true, gloss: 0.62, normalMap: tx.tileN, bump: 1, env: true }),
    plaster: mat({ map: tx.plaster, vc: true, gloss: 0.05 }),
    sign: mat({ map: tx.signs, gloss: 0.2, emissiveMap: tx.signs, emissive: [1, 1, 1], emissiveIntensity: 0.25 }),
    deco: mat({ map: tx.deco, gloss: 0.25, emissiveMap: tx.deco, emissive: [1, 1, 1], emissiveIntensity: 0.42 }),
    thatch: mat({ map: tx.thatch, vc: true, gloss: 0.04 }),
    hazard: mat({ map: tx.hazard, vc: true, gloss: 0.35 }),
    redwhite: mat({ map: tx.redwhite, vc: true, gloss: 0.35 }),
    lamp: mat({ vc: true, emissiveVc: true, emissive: [1, 1, 1], emissiveIntensity: 3.2, gloss: 0.3 }),
    rays: mat({ map: tx.shaft, vc: true, blend: 'add', unlit: true, emissiveVc: true, emissiveMap: tx.shaft, emissive: [1, 1, 1], emissiveIntensity: 1, twoSided: true, noFog: true, color: [0, 0, 0] }),
    glow: mat({ map: tx.glow, vc: true, blend: 'add', unlit: true, emissiveVc: true, emissiveMap: tx.glow, emissive: [1, 1, 1], emissiveIntensity: 1, twoSided: true, noFog: true, color: [0, 0, 0] }),
    water: mat({ map: tx.water, gloss: 0.9, metal: 0.9, normalMap: tx.waterN, bump: 0.3, env: true, noShadow: true, noFog: true }),
    sky: mat({ unlit: true, emissiveMap: tx.sky, emissive: [1, 1, 1], emissiveIntensity: 0.74, noFog: true, twoSided: true, color: [0, 0, 0] }),
    shadow: mat({ map: tx.shadow, blend: 'alpha', unlit: true, color: [0, 0, 0], noFog: true }),
  };
  for (const k of ['ridgeFar', 'ridgeMid', 'ridgeNear']) {
    m[k] = mat({ unlit: true, map: tx[k], alphaTest: 0.5, emissiveMap: tx[k], emissive: [1, 1, 1], emissiveIntensity: 1, noFog: true, twoSided: true, color: [0, 0, 0] });
  }
  m.sky.depthWrite = false; m.sky.update();
  m.water.normalMapTiling.set(5, 5); m.water.update();
  return { m, tx };
}

// ---------- vegetation ----------
const leafUV = (r) => {
  const left = r.chance(0.5);
  const u0 = left ? 0.004 : 0.504, u1 = left ? 0.496 : 0.996;
  return r.chance(0.5) ? [u0, 0, u1, 1] : [u1, 0, u0, 1];
};

function cluster(g, r, c, rad, n, size, pal, cc) {
  for (let i = 0; i < n; i++) {
    let dx, dy, dz;
    do { dx = r.range(-1, 1); dy = r.range(-1, 1); dz = r.range(-1, 1); } while (dx * dx + dy * dy + dz * dz > 1);
    const p = [c[0] + dx * rad[0], c[1] + dy * rad[1], c[2] + dz * rad[2]];
    const s = size * r.range(0.72, 1.28) * 0.5;
    const a = r() * 6.283;
    let rt, up;
    if (r.chance(0.6)) { // horizontal spray: the layered look of a Japanese maple, and a ceiling when seen from below
      const t1 = r.range(-0.32, 0.32), t2 = r.range(-0.32, 0.32);
      rt = [Math.cos(a) * s, t1 * s, Math.sin(a) * s]; up = [-Math.sin(a) * s, t2 * s, Math.cos(a) * s];
    } else {
      const t = r.range(-0.35, 0.35);
      rt = [Math.cos(a) * s, 0, Math.sin(a) * s]; up = [-Math.sin(a) * t * s, s * 0.94, Math.cos(a) * t * s];
    }
    let nx = p[0] - cc[0], ny = (p[1] - cc[1]) + 0.9 * Math.max(rad[0], rad[1]), nz = p[2] - cc[2];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const hgt = clamp(dy * 0.5 + 0.5, 0, 1);
    let col = mix(pal.dark, pal.base, clamp(hgt * 1.3 + r.range(-0.15, 0.2), 0, 1));
    if (r.chance(0.3 + hgt * 0.3)) col = mix(col, pal.light, r.range(0.3, 0.9));
    g.card(p, rt, up, [nx, ny, nz], col, leafUV(r));
  }
}

function maple(G, r, bx, by, bz, h, o = {}) {
  const lx = (o.lean && o.lean[0]) || 0, lz = (o.lean && o.lean[1]) || 0;
  const pal = PAL[o.pal || r.pick(PAL_BAG)];
  const r0 = h * 0.03 + 0.09;
  const mid = [bx + lx * h * 0.12 + r.range(-0.2, 0.2), by + h * 0.22, bz + lz * h * 0.12 + r.range(-0.2, 0.2)];
  const top = [bx + lx * h * 0.36, by + h * 0.44, bz + lz * h * 0.36];
  G.bark.tube([bx, by - 0.5, bz], mid, r0 * 1.35, r0, 6, BARK_D, { uv: 1.4, col2: BARK });
  G.bark.tube(mid, top, r0, r0 * 0.72, 6, BARK, { uv: 1.4 });
  const cc = [bx + lx * h * 0.7, by + h * 0.72, bz + lz * h * 0.7];
  const limbs = o.limbs || r.int(4, 6);
  const dens = o.cards || 10;
  const a0 = r() * 6.283;
  for (let i = 0; i < limbs; i++) {
    const a = a0 + (i / limbs) * 6.283 + r.range(-0.3, 0.3);
    const reach = h * r.range(0.24, 0.4);
    const end = [top[0] + Math.cos(a) * reach + lx * h * 0.34, by + h * r.range(0.6, 0.84), top[2] + Math.sin(a) * reach + lz * h * 0.34];
    const k = [lerp(top[0], end[0], 0.55), lerp(top[1], end[1], 0.7) + h * 0.03, lerp(top[2], end[2], 0.55)];
    G.bark.tube(top, k, r0 * 0.52, r0 * 0.3, 5, BARK, { uv: 1.4 });
    G.bark.tube(k, end, r0 * 0.3, 0.04, 4, BARK, { uv: 1.4 });
    cluster(G.leaf, r, end, [h * 0.21, h * 0.105, h * 0.21], dens, h * 0.3, pal, cc);
  }
  cluster(G.leaf, r, [cc[0], cc[1] + h * 0.14, cc[2]], [h * 0.24, h * 0.12, h * 0.24], dens + 2, h * 0.3, pal, cc);
  if (o.bough) { // a long limb reaching out over the rails with its own canopy
    const [tx, ty, tz] = o.bough;
    const k = [lerp(top[0], tx, 0.5), lerp(top[1], ty, 0.75), lerp(top[2], tz, 0.5)];
    G.bark.tube(top, k, r0 * 0.5, r0 * 0.3, 5, BARK, { uv: 1.4 });
    G.bark.tube(k, [tx, ty, tz], r0 * 0.3, 0.04, 4, BARK, { uv: 1.4 });
    cluster(G.leaf, r, [tx, ty + 0.6, tz], [h * 0.25, h * 0.08, h * 0.25], dens + 3, h * 0.32, pal, [tx, ty - 2, tz]);
  }
}

/** Far forest wall: a few huge foliage cards per tree, cheap. */
function massTree(G, r, x, y, z, h, palName) {
  const pal = PAL[palName || r.pick(PAL_BAG)];
  G.bark.tube([x, y - 1, z], [x + r.range(-0.6, 0.6), y + h * 0.5, z], 0.32, 0.2, 5, BARK_D, { uv: 1.4 });
  const cc = [x, y + h * 0.62, z];
  cluster(G.leaf, r, [x, y + h * 0.66, z], [h * 0.34, h * 0.24, h * 0.34], 9, h * 0.55, { base: shade(pal.base, 0.9), dark: shade(pal.dark, 0.95), light: pal.light }, cc);
}

function bush(G, r, x, y, z, s, palName) {
  const pal = PAL[palName || r.pick(['crimson', 'scarlet', 'orange', 'green', 'amber'])];
  cluster(G.leaf, r, [x, y + s * 0.5, z], [s * 0.7, s * 0.4, s * 0.7], 6, s * 1.1, pal, [x, y - s, z]);
}

function rock(G, r, x, y, z, s) {
  const v = r.range(0.75, 1.05);
  G.flat.blob(x, y + s * 0.3, z, s * r.range(0.8, 1.2), s * r.range(0.5, 0.8), s * r.range(0.8, 1.2), shade(STONE, v * 0.75), 6, 4, shade(STONE, v * 1.15));
}

function stoneLantern(G, x, y, z) {
  const c = STONE, d = shade(STONE, 0.7);
  G.flat.box(x, y + 0.12, z, 0.7, 0.24, 0.7, d, { top: c });
  G.flat.tube([x, y + 0.24, z], [x, y + 1.05, z], 0.16, 0.13, 6, c);
  G.flat.box(x, y + 1.12, z, 0.62, 0.12, 0.62, c);
  G.flat.box(x, y + 1.38, z, 0.44, 0.4, 0.44, d);
  G.lamp.box(x, y + 1.38, z, 0.46, 0.22, 0.24, [1, 0.72, 0.35]);
  G.lamp.box(x, y + 1.38, z, 0.24, 0.22, 0.46, [1, 0.72, 0.35]);
  // roof
  const t = y + 1.58, e = 0.5, A = [x, t + 0.42, z];
  const c0 = [x - e, t, z - e], c1 = [x + e, t, z - e], c2 = [x + e, t, z + e], c3 = [x - e, t, z + e];
  G.flat.tri(c3, c2, A, c); G.flat.tri(c2, c1, A, d); G.flat.tri(c1, c0, A, d); G.flat.tri(c0, c3, A, c);
  G.flat.blob(x, t + 0.46, z, 0.1, 0.12, 0.1, c, 6, 3);
}

function torii(G, x, y, z, w = 3.2, h = 3.6, ry = 0) {
  G.flat.at(x, y, z, ry, (g) => {
    const v = VERMILION, d = shade(VERMILION, 0.72);
    for (const sx of [-1, 1]) {
      g.tube([sx * w * 0.5, -0.2, 0], [sx * w * 0.46, h, 0], 0.17, 0.14, 8, d, { col2: v });
      g.box(sx * w * 0.5, 0.2, 0, 0.5, 0.4, 0.5, [0.12, 0.1, 0.1]);
    }
    g.box(0, h * 0.8, 0, w * 1.08, 0.2, 0.18, v);
    g.box(0, h + 0.1, 0, w * 1.36, 0.24, 0.3, v);
    g.box(0, h + 0.3, 0, w * 1.5, 0.16, 0.42, [0.13, 0.11, 0.11]);
    g.box(0, h * 0.9, 0, 0.18, h * 0.2, 0.1, v);
  });
}

// ---------- buildings ----------
const DUV = (k) => { const [x, y, w, h] = art.DECO[k], e = 0.5 / 1024; return [x / 1024 + e, (y + h) / 1024 - e, (x + w) / 1024 - e, y / 1024 + e]; };
const SIGN_NAME = [0, 0.25, 1, 0];
/** Decal quad centred at (x,y,z), facing local +Z after a yaw of `ry` degrees. */
const plate = (g, x, y, z, w, h, uv, ry = 0) => g.at(x, y, z, ry, (q) => q.quad([-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], [1, 1, 1], uv, [0, 0, 1]));
const FRAME_KEYS = ['plaster', 'flat', 'wood', 'tile', 'lamp', 'deco', 'shiny', 'thatch', 'sign', 'leaf', 'bark', 'ballast'];
/** Run fn with every building geo moved into one local frame (origin, yaw). Local +Z is the front. */
function frame(G, x, y, z, ry, fn) {
  const go = (i) => (i === FRAME_KEYS.length ? fn() : G[FRAME_KEYS[i]].at(x, y, z, ry, () => go(i + 1)));
  go(0);
}
const ROOF_EDGE = [0.2, 0.21, 0.24];

/** Gabled roof with real thickness: ridge along local X, eaves overhang by `ov`, gable ends by `ovx`. */
function gableRoof(G, key, w, d, y0, rise, o = {}) {
  const ov = o.ov ?? 0.8, ovx = o.ovx ?? 0.55, th = o.th ?? 0.15, col = o.col || [1, 1, 1], edge = o.edge || ROOF_EDGE, under = o.under || shade(TIMBER, 0.62);
  const x0 = -w / 2 - ovx, x1 = w / 2 + ovx, zE = d / 2 + ov, yE = y0 - (rise / (d / 2)) * ov, yR = y0 + rise;
  const uvs = o.uv || 2, U = (x1 - x0) / uvs, V = Math.hypot(zE, yR - yE) / uvs;
  for (const s of [1, -1]) {
    const xa = s > 0 ? x0 : x1, xb = s > 0 ? x1 : x0;
    G[key].quad([xa, yE + th, s * zE], [xb, yE + th, s * zE], [xb, yR + th, 0], [xa, yR + th, 0], col, [0, 0, U, V]);
    G.wood.quad([xb, yE, s * zE], [xa, yE, s * zE], [xa, yR, 0], [xb, yR, 0], under, [0, 0, U * 1.5, V * 1.5]);
    G.flat.quad([xa, yE - 0.02, s * zE], [xb, yE - 0.02, s * zE], [xb, yE + th, s * zE], [xa, yE + th, s * zE], edge);
    for (const sx of [1, -1]) { // barge boards
      const x = sx > 0 ? x1 : x0, a = [x, yE - 0.02, s * zE], b = [x, yR - 0.02, 0], c = [x, yR + th, 0], e = [x, yE + th, s * zE];
      if (sx * s > 0) G.flat.quad(a, b, c, e, edge); else G.flat.quad(b, a, e, c, edge);
    }
  }
  G.flat.box(0, yR + th + 0.06, 0, x1 - x0 + 0.12, 0.22, 0.36, edge);
  for (const sx of [1, -1]) G.flat.box(sx * (x1 + 0.02), yR + th + 0.16, 0, 0.16, 0.42, 0.44, shade(edge, 1.25)); // onigawara
  return { yE, yR, zE, x1 };
}

/** Hipped roof (thatch): four slopes rising to a short ridge, with a thick trimmed eave. */
function hipRoof(G, key, w, d, y0, rise, o = {}) {
  const ov = o.ov ?? 1.0, th = o.th ?? 0.38, col = o.col || [1, 1, 1], rl = o.ridge ?? w * 0.5;
  const ex = w / 2 + ov, ez = d / 2 + ov, yE = y0 - 0.45, yR = y0 + rise, hr = rl / 2, uvs = 2.2;
  const P = (x, z, top) => [x, top ? yR : yE + th, z];
  const g = G[key], V = Math.hypot(ez, yR - yE) / uvs;
  g.quad(P(-ex, ez), P(ex, ez), P(hr, 0, 1), P(-hr, 0, 1), col, [0, 0, (2 * ex) / uvs, V]);
  g.quad(P(ex, -ez), P(-ex, -ez), P(-hr, 0, 1), P(hr, 0, 1), col, [0, 0, (2 * ex) / uvs, V]);
  g.tri(P(ex, ez), P(ex, -ez), P(hr, 0, 1), shade(col, 0.9), [0, 0, (2 * ez) / uvs, 0, ez / uvs, V]);
  g.tri(P(-ex, -ez), P(-ex, ez), P(-hr, 0, 1), shade(col, 0.9), [0, 0, (2 * ez) / uvs, 0, ez / uvs, V]);
  // eave edge and soffit
  const ec = shade(col, 0.55), k = 0.94;
  g.quad([-ex * k, yE, ez * k], [ex * k, yE, ez * k], P(ex, ez), P(-ex, ez), ec, [0, 0, 4, 0.2]);
  g.quad([ex * k, yE, -ez * k], [-ex * k, yE, -ez * k], P(-ex, -ez), P(ex, -ez), ec, [0, 0, 4, 0.2]);
  g.quad([ex * k, yE, ez * k], [ex * k, yE, -ez * k], P(ex, -ez), P(ex, ez), ec, [0, 0, 3, 0.2]);
  g.quad([-ex * k, yE, -ez * k], [-ex * k, yE, ez * k], P(-ex, ez), P(-ex, -ez), ec, [0, 0, 3, 0.2]);
  G.flat.quad([-ex * k, yE, -ez * k], [ex * k, yE, -ez * k], [ex * k, yE, ez * k], [-ex * k, yE, ez * k], shade(TIMBER_D, 0.8));
  // ridge: bark-covered cap held down by crossed timbers
  G.wood.box(0, yR + 0.08, 0, rl + 0.9, 0.34, 0.8, shade(TIMBER, 0.75), { uv: 1.2 });
  for (let i = 0; i < 5; i++) {
    const x = lerp(-hr - 0.2, hr + 0.2, i / 4);
    G.wood.tube([x, yR - 0.25, -0.62], [x, yR + 0.62, 0.3], 0.055, 0.055, 4, TIMBER_D, { uv: 1.2 });
    G.wood.tube([x, yR - 0.25, 0.62], [x, yR + 0.62, -0.3], 0.055, 0.055, 4, TIMBER_D, { uv: 1.2 });
  }
}

const WALLS = ['#efe4cf', '#e6d6b8', '#d8c7a8'];

/** Farmhouse (minka). kind: 'thatch' hipped straw roof, 'tile' gabled tile roof with a lean-to over the veranda. */
function minka(G, r, x, y, z, w, d, ry, kind) {
  frame(G, x, y, z, ry, () => {
    const wall = hex(r.pick(WALLS)), base = 0.42, hgt = 2.65, y0 = base + hgt, zf = d / 2;
    G.flat.box(0, base / 2 - 0.3, 0, w + 0.5, base + 0.6, d + 0.5, shade(STONE, 0.78), { top: shade(STONE, 1.1), bottom: false });
    G.plaster.box(0, base + hgt / 2, 0, w, hgt, d, wall, { uv: 3, bottom: false });
    G.wood.box(0, base + 0.48, 0, w + 0.07, 0.96, d + 0.07, shade(TIMBER, 0.82), { uv: 1.1, bottom: false }); // boarded lower wall
    G.wood.box(0, y0 - 0.11, 0, w + 0.22, 0.22, d + 0.22, TIMBER_D, { uv: 1.2 });
    const nx = Math.max(3, Math.round(w / 1.9)), bay = w / nx;
    for (let i = 0; i <= nx; i++) for (const sz of [1, -1]) G.wood.box(-w / 2 + i * bay, base + hgt / 2, sz * zf, 0.17, hgt, 0.2, TIMBER_D, { uv: 1.2, bottom: false });
    for (const sx of [1, -1]) {
      G.wood.box(sx * w / 2, base + hgt / 2, 0, 0.2, hgt, 0.17, TIMBER_D, { uv: 1.2, bottom: false });
      G.wood.box(sx * w / 2, base + 1.55, 0, 0.12, 0.12, d, TIMBER_D, { uv: 1.2 });
      plate(G.deco, sx * (w / 2 + 0.06), base + 1.72, sx * d * 0.22, 1.3, 1.0, DUV('window'), sx * 90);
    }
    // front: one sliding door, paper screens in the other bays
    const door = r.int(0, nx - 1);
    for (let i = 0; i < nx; i++) {
      const cx = -w / 2 + (i + 0.5) * bay;
      if (i === door) plate(G.deco, cx, base + 1.03, zf + 0.06, bay - 0.24, 2.06, DUV('door'));
      else plate(G.deco, cx, base + 1.2, zf + 0.06, bay - 0.24, 1.72, DUV(r.chance(0.7) ? 'shoji' : 'window'));
    }
    plate(G.deco, r.sign() * w * 0.22, base + 1.7, -zf - 0.06, 1.3, 1.0, DUV('window'), 180);
    // veranda (engawa) and its step stone
    G.wood.box(0, base - 0.04, zf + 0.55, w - 0.3, 0.1, 1.1, shade(TIMBER, 1.15), { uv: 0.9 });
    for (let i = 0; i <= nx; i++) G.flat.box(-w / 2 + 0.2 + i * (w - 0.4) / nx, base / 2 - 0.2, zf + 0.95, 0.2, base + 0.3, 0.2, STONE, { bottom: false });
    G.flat.box(-w / 2 + (door + 0.5) * bay, 0.1, zf + 1.45, 1.3, 0.24, 0.6, shade(STONE, 1.15), { bottom: false });
    const eaveZ = zf + 1.35;
    if (kind === 'thatch') {
      hipRoof(G, 'thatch', w, d, y0, d * 0.62, { ov: 1.25, col: hex(r.pick(['#cdb689', '#b9a077', '#d6c092'])) });
      for (let i = 0; i <= nx; i += nx) G.wood.box(-w / 2 + 0.2 + i * (w - 0.4) / nx, (y0 - 0.2) / 2 + base / 2, zf + 1.0, 0.12, y0 - 0.2 - base, 0.12, TIMBER_D, { uv: 1.2, bottom: false });
    } else {
      gableRoof(G, 'tile', w, d, y0, d * 0.4, { ov: 0.75, ovx: 0.7 });
      for (const sx of [1, -1]) { // gable walls with a timber truss and vent
        const gx = sx * w / 2, rh = d * 0.4;
        if (sx > 0) G.plaster.tri([gx, y0, zf], [gx, y0, -zf], [gx, y0 + rh, 0], wall); else G.plaster.tri([gx, y0, -zf], [gx, y0, zf], [gx, y0 + rh, 0], wall);
        G.wood.box(gx + sx * 0.04, y0 + rh * 0.5, 0, 0.1, rh * 0.96, 0.16, TIMBER_D, { uv: 1.2 });
        G.wood.box(gx + sx * 0.04, y0 + rh * 0.36, 0, 0.1, 0.14, d * 0.56, TIMBER_D, { uv: 1.2 });
        G.flat.box(gx + sx * 0.05, y0 + rh * 0.6, 0, 0.06, 0.4, 0.5, [0.1, 0.09, 0.09]);
      }
      // lean-to roof over the veranda
      const ya = y0 - 0.32, yb = y0 - 0.95, x0 = -w / 2 - 0.3, x1 = w / 2 + 0.3;
      G.tile.quad([x0, yb + 0.1, eaveZ], [x1, yb + 0.1, eaveZ], [x1, ya + 0.1, zf], [x0, ya + 0.1, zf], [1, 1, 1], [0, 0, (x1 - x0) / 2, 0.8]);
      G.wood.quad([x1, yb, eaveZ], [x0, yb, eaveZ], [x0, ya, zf], [x1, ya, zf], shade(TIMBER, 0.62), [0, 0, 4, 1]);
      G.flat.quad([x0, yb - 0.02, eaveZ], [x1, yb - 0.02, eaveZ], [x1, yb + 0.1, eaveZ], [x0, yb + 0.1, eaveZ], ROOF_EDGE);
      for (let i = 0; i <= nx; i++) G.wood.box(-w / 2 + 0.2 + i * (w - 0.4) / nx, (yb + base) / 2, zf + 1.0, 0.12, yb - base, 0.12, TIMBER_D, { uv: 1.2, bottom: false });
      // chimney
      const cz = -d * 0.24, cy = y0 + d * 0.4 * 0.52;
      G.plaster.box(w * 0.26, cy + 0.5, cz, 0.55, 1.3, 0.55, shade(wall, 0.9), { uv: 3, bottom: false });
      G.flat.box(w * 0.26, cy + 1.2, cz, 0.75, 0.12, 0.75, ROOF_EDGE);
    }
    // persimmons strung up to dry under the eave
    const py = kind === 'thatch' ? y0 - 0.55 : y0 - 1.05;
    for (let i = 0, n = r.int(4, 7), sx = r.range(-w * 0.4, w * 0.1); i < n; i++) {
      const px = sx + i * 0.2;
      G.flat.box(px, py - 0.42, zf + 1.02, 0.015, 0.84, 0.015, [0.2, 0.16, 0.12]);
      for (let j = 0; j < 5; j++) G.shiny.blob(px, py - 0.12 - j * 0.16, zf + 1.02, 0.062, 0.07, 0.062, hex('#e0621c'), 5, 3, hex('#ff9a3a'));
    }
    // split firewood stacked against the side wall
    if (r.chance(0.75)) {
      const sx = r.sign(), wx = sx * (w / 2 + 0.42);
      for (let row = 0; row < 5; row++) for (let i = 0; i < 9; i++) {
        const v = r.range(0.7, 1.15), zz = -zf * 0.7 + i * 0.2 + (row % 2) * 0.1;
        G.wood.tube([wx - 0.34, 0.1 + row * 0.19, zz], [wx + 0.34, 0.1 + row * 0.19, zz], 0.095, 0.095, 5, shade(hex('#b8946a'), v * 0.8), { uv: 1, cap: true, col2: shade(hex('#e2c296'), v) });
      }
      G.wood.box(wx, 1.12, -zf * 0.7 + 0.85, 0.9, 0.05, 2.1, TIMBER_D, { uv: 1.2 });
    }
  });
}

/** Kura: thick-walled white storehouse with a dark tiled plinth. */
function kura(G, r, x, y, z, ry) {
  frame(G, x, y, z, ry, () => {
    const w = 4.4, d = 3.6, hgt = 4.3, white = hex('#f3eee2');
    G.plaster.box(0, hgt / 2, 0, w, hgt, d, white, { uv: 3, bottom: false });
    G.flat.box(0, 0.65, 0, w + 0.1, 1.3, d + 0.1, [0.2, 0.21, 0.24], { bottom: false, top: [0.3, 0.31, 0.34] });
    for (let i = 0; i < 4; i++) G.flat.box(0, 0.2 + i * 0.32, 0, w + 0.13, 0.03, d + 0.13, [0.82, 0.8, 0.76], { bottom: false });
    G.plaster.box(0, hgt + 0.06, 0, w + 0.3, 0.2, d + 0.3, shade(white, 0.92), { uv: 3 });
    gableRoof(G, 'tile', w, d, hgt + 0.16, d * 0.36, { ov: 0.45, ovx: 0.4, th: 0.14 });
    G.flat.box(0, 1.05, d / 2 + 0.03, 1.25, 2.1, 0.1, [0.16, 0.14, 0.13]);
    G.plaster.box(0, 1.1, d / 2 + 0.1, 1.5, 2.3, 0.1, shade(white, 0.96), { uv: 3 });
    G.flat.box(0, 1.05, d / 2 + 0.16, 1.0, 1.9, 0.04, [0.24, 0.2, 0.17]);
    G.flat.box(0.32, 1.1, d / 2 + 0.2, 0.07, 0.22, 0.04, [0.7, 0.58, 0.3]);
    for (const sz of [1, -1]) { // shuttered window high on each gable
      G.plaster.box(sz * (w / 2 + 0.06), 3.1, 0, 0.12, 0.95, 0.95, shade(white, 0.95), { uv: 3 });
      G.flat.box(sz * (w / 2 + 0.13), 3.1, 0, 0.04, 0.6, 0.55, [0.14, 0.13, 0.13]);
    }
  });
}

/** Little white farm truck. */
function keiTruck(G, x, y, z, ry) {
  frame(G, x, y, z, ry, () => {
    const wh = [0.93, 0.93, 0.9], dk = [0.1, 0.1, 0.11];
    G.shiny.box(0, 0.62, 0.05, 1.4, 0.34, 3.1, wh, { bottom: false });
    G.shiny.box(0, 1.2, 1.05, 1.38, 0.85, 1.05, wh, { bottom: false });
    G.flat.box(0, 1.32, 1.585, 1.2, 0.48, 0.02, [0.22, 0.28, 0.33]);
    for (const sx of [1, -1]) {
      G.flat.box(sx * 0.695, 1.32, 1.1, 0.02, 0.44, 0.7, [0.22, 0.28, 0.33]);
      G.shiny.box(sx * 0.67, 0.95, -0.55, 0.05, 0.36, 1.9, wh);
      for (const wz of [1.0, -0.95]) G.flat.tube([sx * 0.52, 0.3, wz], [sx * 0.72, 0.3, wz], 0.3, 0.3, 8, dk, { cap: true });
      G.lamp.box(sx * 0.48, 0.72, 1.61, 0.22, 0.14, 0.02, [1, 0.9, 0.7]);
    }
    G.shiny.box(0, 0.95, -1.48, 1.38, 0.36, 0.05, wh);
    G.flat.box(0, 0.8, -0.5, 1.28, 0.03, 1.86, [0.3, 0.3, 0.3]);
    for (let i = 0; i < 3; i++) G.flat.box(-0.3 + i * 0.3, 0.98, -0.6 - i * 0.2, 0.4, 0.32, 0.5, mix(hex('#d9a93a'), hex('#f0cf6a'), i / 2), { bottom: false });
  });
}

/** A farmstead on a raised yard: house, storehouse or truck, fence, fruit tree. Origin = yard centre, front = local +Z. */
function farmstead(G, r, x, y, z, ry) {
  const kind = r.pick(['thatch', 'tile', 'tile']);
  const w = r.range(7.5, 9.5), d = r.range(5, 6.2);
  minka(G, r, x, y, z, w, d, ry, kind);
  frame(G, x, y, z, ry, () => {
    const sx = r.sign(), zf = d / 2;
    // low fence with a gateway
    const fz = zf + 3.4, fw = w / 2 + 2.2, gate = r.range(-1.5, 1.5);
    for (let px = -fw; px <= fw + 0.01; px += 0.9) {
      if (Math.abs(px - gate) < 1.1) continue;
      G.wood.box(px, 0.42, fz, 0.1, 0.9, 0.1, TIMBER, { uv: 1.2, bottom: false });
    }
    for (const [a, b] of [[-fw, gate - 1.2], [gate + 1.2, fw]]) for (const hy of [0.36, 0.72]) G.wood.box((a + b) / 2, hy, fz, b - a, 0.07, 0.05, TIMBER, { uv: 1.2 });
    for (const gx of [gate - 1.15, gate + 1.15]) G.wood.box(gx, 0.75, fz, 0.16, 1.5, 0.16, TIMBER_D, { uv: 1.2, bottom: false });
    for (let i = 0; i < 4; i++) bush(G, r, r.range(-fw, fw), -0.05, fz - r.range(0.4, 0.9), r.range(0.5, 0.85), r.pick(['green', 'green', 'crimson', 'amber']));
    persimmon(G, r, -sx * (w / 2 + 1.3), 0, zf + 1.8, r.range(3.4, 4.4));
    stoneLantern(G, gate + 1.9, 0, fz - 1.1);
    G.flat.box(-w / 2 + 1, 0.04, zf + 2.4, 0.9, 0.08, 0.7, shade(STONE, 1.1), { bottom: false });
  });
  const a = (ry * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const side = r.sign();
  if (r.chance(0.6)) { const p = L(side * (w / 2 + 3.4), -0.6); kura(G, r, p[0], y, p[1], ry + (side > 0 ? -90 : 90) + 90); }
  if (r.chance(0.7)) { const p = L(-side * (w / 2 + 1.2), d / 2 + 2.0); keiTruck(G, p[0], y, p[1], ry + r.range(-30, 30)); }
}

/** Rice sheaves drying on a rack. */
function hasa(G, r, x, y, z, len, ry) {
  G.wood.at(x, y, z, ry, (g) => {
    for (const sx of [-len / 2, 0, len / 2]) {
      g.tube([sx - 0.25, 0, 0.35], [sx, 1.7, 0], 0.045, 0.04, 5, TIMBER);
      g.tube([sx + 0.25, 0, -0.35], [sx, 1.7, 0], 0.045, 0.04, 5, TIMBER);
    }
    g.tube([-len / 2 - 0.3, 1.66, 0], [len / 2 + 0.3, 1.66, 0], 0.05, 0.05, 5, TIMBER);
  });
  G.flat.at(x, y, z, ry, (g) => {
    for (let sx = -len / 2; sx <= len / 2; sx += 0.42) {
      const c = mix(hex('#d9a93a'), hex('#f0cf6a'), r());
      g.box(sx, 1.05, 0.14, 0.36, 1.15, 0.18, shade(c, 0.8), { top: c, bottom: false });
      g.box(sx, 1.05, -0.14, 0.36, 1.15, 0.18, shade(c, 0.7), { top: c, bottom: false });
    }
  });
}

function persimmon(G, r, x, y, z, h) {
  const top = [x + r.range(-0.4, 0.4), y + h * 0.5, z + r.range(-0.4, 0.4)];
  G.bark.tube([x, y - 0.3, z], top, 0.18, 0.11, 6, BARK_D, { uv: 1.4 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.283 + r.range(-0.4, 0.4), rr = h * r.range(0.25, 0.42);
    const e = [top[0] + Math.cos(a) * rr, top[1] + h * r.range(0.15, 0.45), top[2] + Math.sin(a) * rr];
    G.bark.tube(top, e, 0.07, 0.025, 4, BARK_D, { uv: 1.4 });
    for (let k = 0; k < 3; k++) {
      const t = r.range(0.45, 1);
      G.shiny.blob(lerp(top[0], e[0], t) + r.range(-0.12, 0.12), lerp(top[1], e[1], t) - 0.14, lerp(top[2], e[2], t) + r.range(-0.12, 0.12), 0.13, 0.115, 0.13, hex('#e8641c'), 6, 4, hex('#ff9a3a'));
    }
  }
}

function telegraphPole(G, x, y, z, nextY, wires = true) {
  const h = 7.6;
  G.wood.tube([x, y - 0.4, z], [x, y + h, z], 0.14, 0.1, 6, TIMBER_D, { uv: 1.5, col2: TIMBER });
  G.wood.box(x, y + h - 0.6, z, 2.0, 0.12, 0.12, TIMBER, { uv: 1.5 });
  G.wood.box(x, y + h - 1.3, z, 1.5, 0.1, 0.1, TIMBER, { uv: 1.5 });
  const wc = [0.1, 0.09, 0.09];
  for (const [ox, oy] of [[-0.9, -0.5], [0, -0.5], [0.9, -0.5], [-0.65, -1.22], [0.65, -1.22]]) {
    G.flat.box(x + ox, y + h + oy + 0.1, z, 0.07, 0.14, 0.07, [0.85, 0.85, 0.8]);
    const N = wires ? 5 : 0;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const sag = (t) => -1.1 * Math.sin(t * Math.PI);
      G.flat.tube([x + ox, lerp(y, nextY, t0) + h + oy + 0.16 + sag(t0), z - t0 * CHUNK], [x + ox, lerp(y, nextY, t1) + h + oy + 0.16 + sag(t1), z - t1 * CHUNK], 0.022, 0.022, 3, wc);
    }
  }
}

function sunShaft(G, r, x, y, z, len, w, alpha) {
  // slanted along the light direction, facing the camera (+Z)
  const L = [-SUN[0], -SUN[1], -SUN[2]];
  const p1 = [x + L[0] * len, y + L[1] * len, z + L[2] * len];
  let wx = L[1], wy = -L[0]; const l = Math.hypot(wx, wy); wx = (wx / l) * w; wy = (wy / l) * w;
  const c = [1 * alpha, 0.8 * alpha, 0.5 * alpha];
  G.rays.quad([x - wx, y - wy, z], [x + wx, y + wy, z], [p1[0] + wx, p1[1] + wy, p1[2]], [p1[0] - wx, p1[1] - wy, p1[2]], c, [0, 0, 1, 1], [0, 0, 1]);
}

/** Where the land drops to the lake: rock outcrops on the steep faces, scrub between them, reeds at the waterline. */
function banks(G, r, k) {
  const s0 = k * CHUNK;
  for (let i = 0; i < 150; i++) {
    const side = r.sign(), x = side * r.range(6.8, 112), sv = r.range(0.5, BLEND + 2), y = groundY(x, s0 + sv);
    if (y < -9.5 || y > 12) continue;
    const slope = Math.hypot(groundY(x, s0 + sv + 1.2) - groundY(x, s0 + sv - 1.2), groundY(x + 1.2, s0 + sv) - groundY(x - 1.2, s0 + sv)) / 2.4;
    if (slope > 0.42) { // crag: a stack of flattened boulders, mossed on top
      const n = r.int(2, 4), R0 = r.range(1.2, 3.4);
      for (let j = 0; j < n; j++) {
        const rr = R0 * r.range(0.5, 1), v = r.range(0.7, 1.05);
        G.plaster.blob(x + r.range(-1, 1) * R0 * 0.7, y + r.range(-0.3, 0.6) * R0 * 0.5, -sv + r.range(-1, 1) * R0 * 0.7, rr * r.range(0.9, 1.4), rr * r.range(0.45, 0.8), rr * r.range(0.9, 1.3),
          shade(hex('#6e665e'), v * 0.7), 7, 5, mix(shade(hex('#8c857c'), v), hex('#6f7a44'), r.range(0, 0.5)));
      }
      if (r.chance(0.6)) bush(G, r, x + r.range(-2, 2), y + 0.2, -sv + r.range(-2, 2), r.range(0.9, 1.7));
    } else if (r.chance(0.55)) bush(G, r, x, y - 0.1, -sv, r.range(0.8, 1.8));
    if (y < -8.6 && y > -9.5) { // reeds standing in the shallows
      const c = mix(hex('#c9a24a'), hex('#8a8a3a'), r());
      for (let j = 0; j < 3; j++) { const a = r() * 3.14; G.rice.card([x + r.range(-1, 1), -9.6 + 0.7, -sv + r.range(-1, 1)], [Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3], [0, 0.75, 0], [0, 1, 0], shade(c, 0.7), [0, 1, 1.2, 0], c); }
    }
  }
}

const HAS_POLE = (k) => biomeOf(k) === 'forest' || biomeOf(k) === 'paddy';

// ---------- chunk ----------
const XS = [5.4, 6.6, 8.2, 10, 12, 15, 19, 24, 30, 35, 48, 62, 80, 120];
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
/** Paddy plots: two bands per side per chunk, each either standing rice or harvested stubble. */
export const plotIsRice = (k, x) => hash(k * 4 + (x > 0 ? 2 : 0) + (Math.abs(x) < 35 ? 0 : 1)) < 0.55;
const newGeos = () => ({ ballast: new Geo(), litter: new Geo(), paddy: new Geo(), wood: new Geo(), bark: new Geo(), leaf: new Geo(), flat: new Geo(), shiny: new Geo(), tile: new Geo(), plaster: new Geo(), sign: new Geo(), lamp: new Geo(), rays: new Geo(), hazard: new Geo(), stubble: new Geo(), rice: new Geo(), foam: new Geo(), deco: new Geo(), thatch: new Geo() });

function ground(G, k, biome) {
  const s0 = k * CHUNK, STEP = 5, rows = CHUNK / STEP;
  const cols = [];
  for (let i = XS.length - 1; i >= 0; i--) cols.push(-XS[i]);
  for (let i = 0; i < XS.length; i++) cols.push(XS[i]);
  const prevB = biomeOf(k - 1);
  for (let j = 0; j < rows; j++) {
    const sa = j * STEP, sb = sa + STEP;
    const rowBiome = (prevB !== biome && sa < BLEND * 0.5) ? prevB : biome;
    // track bed
    const bed = rowBiome === 'bridge' ? G.wood : G.ballast;
    const bc = rowBiome === 'bridge' ? [0.62, 0.5, 0.42] : [1, 1, 1];
    const uvs = rowBiome === 'bridge' ? 2.4 : 4;
    bed.quad([-5.4, 0, -sa], [5.4, 0, -sa], [5.4, 0, -sb], [-5.4, 0, -sb], bc, [-5.4 / uvs, (s0 + sa) / uvs, 5.4 / uvs, (s0 + sb) / uvs], [0, 1, 0]);
    for (let i = 0; i < cols.length - 1; i++) {
      const x0 = cols[i], x1 = cols[i + 1];
      if (x0 === -5.4 && x1 === 5.4) continue;
      const a = Math.min(Math.abs(x0), Math.abs(x1));
      const y00 = groundY(x0, s0 + sa), y10 = groundY(x1, s0 + sa), y11 = groundY(x1, s0 + sb), y01 = groundY(x0, s0 + sb);
      if (Math.max(y00, y10, y11, y01) < -10.5) continue; // river: the water plane shows through
      const isPaddy = rowBiome === 'paddy' && a >= 8.2 && a < 62;
      const g = isPaddy ? (plotIsRice(k, (x0 + x1) / 2) ? G.paddy : G.stubble) : a < 6.6 ? G.ballast : G.litter;
      const uv = isPaddy ? 6 : a < 6.6 ? 4 : 7;
      let col;
      if (isPaddy) col = shade([1, 1, 1], 0.94 + 0.08 * Math.sin((s0 + sa) * 0.21 + x0));
      else if (a < 6.6) col = [0.8, 0.76, 0.72];
      else { const f = clamp((a - 6.6) / 50, 0, 1); col = mix([1, 0.98, 0.95], [0.72, 0.4, 0.26], f); if (y00 < -1.5) col = mix(col, [0.5, 0.42, 0.34], clamp((-1.5 - y00) / 6, 0, 0.75)); }
      // smooth shading: per-vertex normals from the height field
      const N = (x, sv) => { const e = 0.6, dx = (groundY(x + e, sv) - groundY(x - e, sv)) / (2 * e), ds = (groundY(x, sv + e) - groundY(x, sv - e)) / (2 * e); const l = Math.hypot(dx, 1, ds); return [-dx / l, 1 / l, ds / l]; };
      const V = (x, y, sl) => { const n = isPaddy || a < 6.6 ? [0, 1, 0] : N(x, s0 + sl); return g.vert(x, y, -sl, n[0], n[1], n[2], x / uv, (s0 + sl) / uv, col); };
      const i0 = V(x0, y00, sa); V(x1, y10, sa); V(x1, y11, sb); V(x0, y01, sb);
      g.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
}

function tracks(G, k, biome) {
  const rail = [0.5, 0.46, 0.44], railTop = [0.92, 0.84, 0.76];
  for (const lx of LANES) {
    for (const o of [-0.72, 0.72]) {
      G.shiny.box(lx + o, 0.115, -CHUNK / 2, 0.075, 0.15, CHUNK, rail, { top: railTop, bottom: false });
    }
    for (let s = 0.33; s < CHUNK; s += 0.667) {
      const v = 0.3 + 0.1 * Math.sin(s * 12.9 + lx);
      G.wood.box(lx, 0.02, -s, 2.5, 0.1, 0.25, [v, v * 0.8, v * 0.66], { bottom: false, uv: 1.2 });
    }
  }
}

function forest(G, r, k, dens = 1) {
  const s0 = k * CHUNK;
  for (const side of [-1, 1]) {
    // front row leaning over the rails
    for (let s = r.range(0, 3); s < CHUNK; s += r.range(4.6, 6.6) / dens) {
      const a = r.range(7.4, 9.8), x = side * a, h = r.range(8.5, 12.5);
      const y = groundY(x, s0 + s);
      if (y < -8.4) continue;
      const o = { lean: [-side * r.range(0.18, 0.34), r.range(-0.08, 0.08)], cards: 9 };
      if (r.chance(0.5)) o.bough = [side * r.range(0.4, 4.6), r.range(9.2, 11.6), -s + r.range(-2.5, 2.5)];
      maple(G, r, x, y, -s, h, o);
      if (r.chance(0.5)) bush(G, r, side * r.range(6.6, 7.6), groundY(side * 7, s0 + s) - 0.1, -s + r.range(1, 3), r.range(0.7, 1.2));
    }
    // second row, taller
    for (let s = r.range(0, 4); s < CHUNK; s += r.range(6, 9) / dens) {
      const a = r.range(12.5, 22), x = side * a;
      const y = groundY(x, s0 + s);
      if (y < -8.4) continue;
      maple(G, r, x, y, -s, r.range(11, 16), { cards: 6, limbs: 4, lean: [-side * 0.1, 0] });
    }
    // forest wall
    for (let i = 0; i < 18; i++) {
      const a = i < 9 ? r.range(26, 60) : r.range(56, 116), x = side * a, s = r() * CHUNK;
      const y = groundY(x, s0 + s);
      if (y < -8.6) continue;
      massTree(G, r, x, y, -s, r.range(13, 20));
    }
    for (let i = 0; i < 3; i++) {
      const x = side * r.range(6.4, 8.4), s = r() * CHUNK, y = groundY(x, s0 + s);
      if (y > -3) rock(G, r, x, y, -s, r.range(0.25, 0.7));
    }
    if (r.chance(0.45)) {
      const x = side * 6.9, s = r.range(4, 36), y = groundY(x, s0 + s);
      if (y > -3) stoneLantern(G, x, y - 0.05, -s);
    }
  }
  for (let i = 0; i < 6; i++) sunShaft(G, r, r.range(-12, 4), r.range(10, 13), -r.range(0, CHUNK) + 6, r.range(20, 27), r.range(0.8, 2.0), r.range(0.05, 0.11));
}

function paddies(G, r, k) {
  const s0 = k * CHUNK, farms = [];
  for (const side of [-1, 1]) {
    // sparse roadside trees: ginkgo gold and the odd maple
    for (let s = r.range(2, 10); s < CHUNK; s += r.range(11, 17)) {
      const x = side * r.range(7.6, 9), y = groundY(x, s0 + s);
      maple(G, r, x, y, -s, r.range(7, 10), { pal: r.pick(['gold', 'gold', 'amber', 'scarlet', 'crimson']), cards: 9, lean: [-side * 0.12, 0] });
    }
    // a farmstead on a raised yard, either close to the line or out across the fields
    const farm = r.chance(0.65) ? { a: r.chance(0.55) ? r.range(22.5, 24) : r.range(47, 50), s: biomeOf(k - 1) === 'paddy' ? r.range(13, 27) : r.range(24, 28), rx: 11.5, rz: 9.5 } : null;
    farms.push(farm);
    if (farm) {
      const fy = -0.36, ry = -side * r.range(12, 40);
      frame(G, side * farm.a, fy, -farm.s, ry, () => G.ballast.box(0, -0.3, 0.8, 21, 0.6, 15.5, [0.86, 0.74, 0.6], { uv: 4, bottom: false, top: [0.98, 0.88, 0.72] }));
      farmstead(G, r, side * farm.a, fy, -farm.s, ry);
    }
    // earthen bunds between plots, grassed over
    const bund = [0.56, 0.6, 0.36];
    G.litter.box(side * 35, -0.6, -CHUNK / 2, 1.3, 0.5, CHUNK, bund, { uv: 7, bottom: false });
    G.litter.box(side * 8.7, -0.62, -CHUNK / 2, 0.9, 0.42, CHUNK, bund, { uv: 7, bottom: false });
    G.litter.box(side * 35.4, -0.6, -0.6, 54, 0.5, 1.2, bund, { uv: 7, bottom: false });
    // standing rice: rows of cards across the plot, facing the runner
    for (const [xa, xb, step] of [[9.4, 34.2, 1.7], [35.8, 61.5, 3.4]]) {
      const xm = side * (xa + xb) / 2;
      if (!plotIsRice(k, xm)) continue;
      const w = xb - xa;
      for (let sv = 1.6 + r() * 0.6; sv < CHUNK - 0.8; sv += step) {
        const c = shade([1, 0.97, 0.9], r.range(0.86, 1.08)), h = r.range(0.82, 1.0), skew = r.range(-0.3, 0.3);
        const row = (a, b) => G.rice.card([side * (a + b) / 2, -0.75 + h / 2, -sv], [(b - a) / 2, 0, skew * (b - a) / w], [0, h / 2, 0], [0, 1, 0], shade(c, 0.72), [a / 2.4, 1, b / 2.4, 0], c);
        if (farm && Math.abs(sv - farm.s) < farm.rz && farm.a - farm.rx < xb && farm.a + farm.rx > xa) { // leave the farmyard clear
          if (farm.a - farm.rx - xa > 0.6) row(xa, farm.a - farm.rx);
          if (xb - farm.a - farm.rx > 0.6) row(farm.a + farm.rx, xb);
        } else row(xa, xb);
      }
    }
    for (let i = 0; i < 4; i++) { // drying racks stand on harvested plots only
      const x = side * r.range(11, 58);
      if (farm && Math.abs(Math.abs(x) - farm.a) < farm.rx + 3) continue;
      if (!plotIsRice(k, x) && Math.abs(Math.abs(x) - 35) > 3) hasa(G, r, x, -0.75, -r.range(3, CHUNK - 3), r.range(4, 7), r.range(-20, 20));
    }
    if (!(farm && farm.a < 30) && r.chance(0.7)) persimmon(G, r, side * r.range(9.5, 13), -0.7, -r.range(4, 36), r.range(3.4, 4.6));
    for (let i = 0; i < 8; i++) {
      const x = side * r.range(66, 112), s = r() * CHUNK;
      massTree(G, r, x, groundY(x, s0 + s), -s, r.range(13, 19));
    }
    for (let i = 0; i < 2; i++) { const x = side * r.range(6.5, 7.4), s = r() * CHUNK; bush(G, r, x, groundY(x, s0 + s), -s, r.range(0.5, 0.9), 'amber'); }
  }
  // a path of torii climbing away from the line
  const nearFarm = (i) => farms[i] && farms[i].a < 36;
  if (r.chance(0.55) && !(nearFarm(0) && nearFarm(1))) {
    const side = nearFarm(0) ? 1 : nearFarm(1) ? -1 : r.sign(), sz = r.range(8, 30);
    for (let i = 0; i < 5; i++) torii(G, side * (15 + i * 3.4), -0.75, -sz, 2.6, 3.1, 90);
    stoneLantern(G, side * 12.6, -0.75, -sz - 1.6); stoneLantern(G, side * 12.6, -0.75, -sz + 1.6);
  }
  telegraphPole(G, 6.15, -0.5, -20, -0.5, HAS_POLE(k + 1));
}

/** Slatted platform bench; the seat faces local +Z. */
function bench(G, x, y, z, ry, len = 2.2) {
  G.wood.at(x, y, z, ry, (g) => {
    for (const oz of [-0.13, 0.02, 0.17]) g.box(0, 0.44, oz, len, 0.04, 0.12, TIMBER, { uv: 1.2 });
    for (const oy of [0.66, 0.84]) g.box(0, oy, -0.25, len, 0.11, 0.04, TIMBER, { uv: 1.2 });
  });
  G.flat.at(x, y, z, ry, (g) => {
    const c = [0.13, 0.13, 0.14];
    for (const ox of [-len / 2 + 0.22, len / 2 - 0.22]) {
      g.box(ox, 0.21, 0, 0.06, 0.42, 0.44, c, { bottom: false });
      g.box(ox, 0.68, -0.28, 0.06, 0.52, 0.05, c);
      g.box(ox, 0.62, 0, 0.05, 0.04, 0.5, c);
    }
  });
}

/** Red pillar post box, its slot facing the track. */
function postbox(G, x, y, z, side) {
  const red = hex('#b3261c');
  G.flat.tube([x, y, z], [x, y + 0.1, z], 0.3, 0.3, 12, [0.16, 0.15, 0.15], { cap: true });
  G.shiny.tube([x, y + 0.1, z], [x, y + 1.12, z], 0.25, 0.25, 12, red);
  G.shiny.tube([x, y + 1.12, z], [x, y + 1.2, z], 0.29, 0.27, 12, shade(red, 0.85));
  G.shiny.blob(x, y + 1.2, z, 0.27, 0.12, 0.27, red, 12, 5);
  G.flat.box(x - side * 0.245, y + 0.9, z, 0.03, 0.05, 0.26, [0.05, 0.05, 0.05]);
  plate(G.deco, x - side * 0.262, y + 0.62, z, 0.2, 0.2, DUV('post'), -side * 90);
}
/** A trunk, a couple of crates and a milk churn waiting for the next train. */
function luggage(G, r, x, y, z, side) {
  const w0 = r.range(0.7, 0.85);
  G.wood.box(x, y + 0.24, z, 0.56, 0.48, w0, shade(TIMBER, 1.25), { uv: 0.7, bottom: false });
  G.wood.box(x + r.range(-0.05, 0.05), y + 0.66, z + r.range(-0.08, 0.08), 0.46, 0.36, 0.58, shade(TIMBER, 1.05), { uv: 0.7, bottom: false });
  for (const o of [-0.2, 0.2]) G.flat.box(x - side * 0.285, y + 0.24, z + o * w0, 0.012, 0.48, 0.05, [0.12, 0.11, 0.1]);
  G.flat.box(x - side * 0.1, y + 0.2, z + w0 / 2 + 0.42, 0.42, 0.4, 0.62, hex('#6b4a2e'), { bottom: false, top: hex('#7a5636') }); // leather trunk
  for (const o of [-0.18, 0.18]) G.flat.box(x - side * 0.1, y + 0.2, z + w0 / 2 + 0.42 + o, 0.44, 0.42, 0.04, [0.2, 0.14, 0.09], { bottom: false });
  const cz = z - w0 / 2 - 0.36, steel = [0.62, 0.64, 0.66];
  G.shiny.tube([x, y, cz], [x, y + 0.5, cz], 0.19, 0.19, 10, steel);
  G.shiny.tube([x, y + 0.5, cz], [x, y + 0.62, cz], 0.19, 0.11, 10, steel);
  G.shiny.tube([x, y + 0.62, cz], [x, y + 0.7, cz], 0.11, 0.13, 10, shade(steel, 0.85), { cap: true });
}
/** Fire point against the fence: red cabinet, lamp, a pair of buckets. */
function hydrant(G, x, y, z, side) {
  const red = hex('#b3261c');
  G.flat.box(x, y + 0.6, z, 0.1, 1.2, 0.1, [0.13, 0.13, 0.14], { bottom: false });
  G.shiny.box(x - side * 0.1, y + 1.2, z, 0.24, 0.62, 0.5, red);
  G.flat.box(x - side * 0.225, y + 1.2, z, 0.012, 0.3, 0.3, [0.93, 0.9, 0.82]);
  G.lamp.blob(x - side * 0.1, y + 1.6, z, 0.07, 0.08, 0.07, [1, 0.25, 0.15], 8, 4);
  for (const o of [-0.42, 0.42]) {
    G.shiny.tube([x - side * 0.12, y, z + o], [x - side * 0.12, y + 0.3, z + o], 0.12, 0.16, 10, red);
    G.flat.tube([x - side * 0.12, y + 0.28, z + o], [x - side * 0.12, y + 0.3, z + o], 0.15, 0.15, 10, [0.1, 0.1, 0.1], { cap: true });
  }
}
function planter(G, r, x, y, z, len = 1.3) {
  G.wood.box(x, y + 0.22, z, 0.5, 0.44, len, shade(TIMBER, 0.9), { uv: 0.8, bottom: false });
  G.flat.box(x, y + 0.43, z, 0.4, 0.04, len - 0.1, [0.2, 0.15, 0.1], { bottom: false });
  for (let i = 0; i < 2; i++) bush(G, r, x, y + 0.3, z + (i - 0.5) * len * 0.5, 0.42, r.pick(['green', 'crimson', 'amber', 'green']));
}

/** The station house behind the left platform. Frame: floor at platform height, front (+Z local) faces the track. */
function stationHouse(G, r, cx, PH, s, w, named = true) {
  const d = 6.4, hgt = 3.25, zf = d / 2;
  frame(G, cx, PH, -s, 90, () => {
    const wall = hex('#ece1cb');
    G.plaster.box(0, -1.0, 0.6, w + 0.6, 2.0, d + 1.8, shade(CONCRETE, 0.78), { top: CONCRETE, uv: 3, bottom: false }); // foundation + apron to the platform
    G.plaster.box(0, hgt / 2, 0, w, hgt, d, wall, { uv: 3, bottom: false });
    G.wood.box(0, 0.5, 0, w + 0.07, 1.0, d + 0.07, shade(TIMBER, 0.8), { uv: 1.1, bottom: false });
    G.wood.box(0, hgt - 0.12, 0, w + 0.24, 0.24, d + 0.24, TIMBER_D, { uv: 1.2 });
    G.wood.box(0, 2.42, zf + 0.02, w, 0.14, 0.14, TIMBER_D, { uv: 1.2 });
    const nb = 5, bay = w / nb;
    for (let i = 0; i <= nb; i++) for (const sz of [1, -1]) G.wood.box(-w / 2 + i * bay, hgt / 2, sz * zf, 0.2, hgt, 0.22, TIMBER_D, { uv: 1.2, bottom: false });
    const bx = (i) => -w / 2 + (i + 0.5) * bay, fz = zf + 0.07, bw = bay - 0.3;
    // bay 0: posters · 1: windows · 2: entrance with noren · 3: ticket window · 4: windows + timetable
    plate(G.deco, bx(0) - 0.5, 1.62, fz, 0.86, 1.08, DUV('poster'));
    plate(G.deco, bx(0) + 0.5, 1.62, fz, 0.86, 1.08, DUV('poster'));
    plate(G.deco, bx(1), 1.68, fz, bw, 1.35, DUV('glass'));
    G.flat.box(bx(2), 1.15, zf - 0.02, bw, 2.3, 0.14, [0.09, 0.07, 0.06]);
    G.flat.box(bx(2), 0.9, zf + 0.04, bw * 0.6, 1.5, 0.02, [0.42, 0.27, 0.14]);
    plate(G.deco, bx(2), 1.98, fz + 0.06, bw, 0.74, DUV('noren'));
    plate(G.deco, bx(3), 1.5, fz, bw, 1.0, DUV('window'));
    G.wood.box(bx(3), 0.98, zf + 0.2, bw, 0.06, 0.34, TIMBER, { uv: 1.2 });
    plate(G.deco, bx(3), 2.75, fz + 0.03, 1.9, 0.48, DUV('kippu'));
    plate(G.deco, bx(4), 1.55, fz, bw, 1.0, DUV('timetable'));
    G.wood.box(bx(4), 1.55, zf + 0.04, bw + 0.14, 1.14, 0.05, TIMBER_D, { uv: 1.2 });
    bench(G, bx(1), 0, zf + 0.45, 0, 2.0);
    // post box and a fire bucket by the door
    G.shiny.tube([bx(2) + bay * 0.72, 0, zf + 0.5], [bx(2) + bay * 0.72, 1.15, zf + 0.5], 0.21, 0.21, 10, hex('#c7352a'), { cap: true });
    G.shiny.blob(bx(2) + bay * 0.72, 1.15, zf + 0.5, 0.25, 0.14, 0.25, hex('#c7352a'), 10, 4);
    plate(G.deco, bx(2) + bay * 0.72, 0.8, zf + 0.72, 0.26, 0.26, DUV('post'));
    // gable ends: the near one (local -X faces the runner) carries the name board and a clock
    const rise = d * 0.38;
    for (const sx of [1, -1]) {
      const gx = sx * w / 2;
      if (sx > 0) G.plaster.tri([gx, hgt, zf], [gx, hgt, -zf], [gx, hgt + rise, 0], wall); else G.plaster.tri([gx, hgt, -zf], [gx, hgt, zf], [gx, hgt + rise, 0], wall);
      G.wood.box(gx + sx * 0.04, hgt + rise * 0.48, 0, 0.1, rise * 0.94, 0.16, TIMBER_D, { uv: 1.2 });
      G.wood.box(gx, hgt / 2, 0, 0.22, hgt, 0.2, TIMBER_D, { uv: 1.2, bottom: false });
      plate(G.deco, gx + sx * 0.06, 1.7, -d * 0.24, 1.5, 1.2, DUV('glass'), sx * 90);
      plate(G.deco, gx + sx * 0.06, 1.7, d * 0.24, 1.5, 1.2, DUV('glass'), sx * 90);
      plate(G.deco, gx + sx * 0.12, hgt + rise * 0.42, 0, 0.9, 0.9, DUV('clock'), sx * 90);
      if (named) {
        G.wood.box(gx + sx * 0.05, 2.78, 0, 0.08, 0.84, 3.3, TIMBER_D, { uv: 1.2 });
        plate(G.sign, gx + sx * 0.1, 2.78, 0, 3.1, 0.7, SIGN_NAME, sx * 90);
      }
    }
    gableRoof(G, 'tile', w, d, hgt, rise, { ov: 1.25, ovx: 0.8, th: 0.16 });
    // porch posts under the front eave
    for (let i = 0; i <= nb; i++) {
      G.wood.box(-w / 2 + i * bay, 1.3, zf + 1.15, 0.14, 2.6, 0.14, TIMBER, { uv: 1.2, bottom: false });
      G.flat.box(-w / 2 + i * bay, 0.1, zf + 1.15, 0.26, 0.2, 0.26, STONE, { bottom: false });
    }
    G.wood.box(0, 2.62, zf + 1.15, w + 0.3, 0.14, 0.14, TIMBER, { uv: 1.2 });
    for (let i = 0; i < 3; i++) { // paper lanterns along the porch
      const lx = bx(1) + i * bay;
      G.flat.box(lx, 2.42, zf + 1.15, 0.02, 0.3, 0.02, [0.1, 0.1, 0.1]);
      G.lamp.blob(lx, 2.12, zf + 1.15, 0.16, 0.22, 0.16, [1, 0.62, 0.3], 8, 5);
    }
    // chimney
    G.plaster.box(-w * 0.28, hgt + rise * 0.55 + 0.5, -d * 0.2, 0.6, 1.4, 0.6, shade(wall, 0.9), { uv: 3, bottom: false });
    G.flat.box(-w * 0.28, hgt + rise * 0.55 + 1.24, -d * 0.2, 0.8, 0.12, 0.8, ROOF_EDGE);
  });
}

function station(G, r, k) {
  const first = biomeOf(k - 1) !== 'station', last = biomeOf(k + 1) !== 'station';
  const sA = first ? 12 : 0, sB = last ? 30 : CHUNK; // platform extent within the chunk
  const PH = 1.12, X0 = 5.05, X1 = 10.2;
  const hs = first ? 26 : 14, hw = first ? 11 : 12; // station house position / length along the line
  const white = [0.9, 0.88, 0.82], iron = [0.13, 0.13, 0.14], yellow = hex('#e8b820');
  for (const side of [-1, 1]) {
    const xc = side * (X0 + X1) / 2, w = X1 - X0, len = sB - sA, zc = -(sA + sB) / 2;
    G.plaster.box(xc, PH / 2 - 0.3, zc, w, PH + 0.6, len, shade(CONCRETE, 0.8), { top: shade(CONCRETE, 0.93), uv: 3, bottom: false });
    // stone coping, white safety line, tactile strip
    G.plaster.box(side * (X0 + 0.3), PH - 0.05, zc, 0.74, 0.16, len, shade(CONCRETE, 1.12), { uv: 1.5 });
    G.flat.box(side * (X0 + 0.2), PH + 0.036, zc, 0.11, 0.012, len, [0.95, 0.94, 0.9], { bottom: false });
    G.flat.box(side * (X0 + 0.95), PH + 0.012, zc, 0.42, 0.024, len, yellow, { bottom: false });
    for (let s = sA + 0.2; s < sB; s += 0.42) G.flat.box(side * (X0 + 0.95), PH + 0.03, -s, 0.3, 0.014, 0.05, shade(yellow, 0.72), { bottom: false });
    for (let s = sA + 1.25; s < sB; s += 2.5) {
      G.plaster.box(side * (X0 - 0.04), PH / 2 - 0.35, -s, 0.16, PH + 0.5, 0.5, shade(CONCRETE, 0.66), { uv: 3, bottom: false });
      G.flat.box(side * (X0 - 0.012), 0.42, -s - 1.25, 0.02, 0.5, 1.7, [0.2, 0.19, 0.18]);
    }
    // end ramps with side walls and a handrail
    const xi = side * X0, xo = side * X1;
    for (const [on, zl, zh] of [[first, -(sA - 5), -sA], [last, -(sB + 5), -sB]]) {
      if (!on) continue;
      const up = zh < zl; // true when the ramp climbs towards -Z
      const a = [side > 0 ? xi : xo, -0.5, zl], b = [side > 0 ? xo : xi, -0.5, zl], c = [side > 0 ? xo : xi, PH, zh], e = [side > 0 ? xi : xo, PH, zh];
      if (up) G.plaster.quad(a, b, c, e, CONCRETE, [0, 0, 2, 2]); else G.plaster.quad(b, a, e, c, CONCRETE, [0, 0, 2, 2]);
      for (const x of [xi, xo]) { G.plaster.tri([x, -0.5, zl], [x, PH, zh], [x, -0.5, zh], shade(CONCRETE, 0.75)); G.plaster.tri([x, PH, zh], [x, -0.5, zl], [x, -0.5, zh], shade(CONCRETE, 0.75)); }
      for (let i = 0; i <= 3; i++) { const t = i / 3, y = lerp(-0.5, PH, t), z = lerp(zl, zh, t); G.flat.box(xo - side * 0.08, y + 0.5, z, 0.06, 1.0, 0.06, iron, { bottom: false }); }
      for (const hy of [0.55, 1.0]) G.flat.tube([xo - side * 0.08, -0.5 + hy, zl], [xo - side * 0.08, PH + hy, zh], 0.03, 0.03, 4, iron);
      G.flat.box(side * (X0 + 0.4), PH + 0.5, zh, 0.06, 1.0, 0.06, iron, { bottom: false });
      G.hazard.box(side * (X0 + 1.5), PH + 0.85, zh, 2.2, 0.3, 0.05, [1, 1, 1], { uv: 0.6 });
      G.flat.box(side * (X0 + 2.6), PH + 0.5, zh, 0.06, 1.0, 0.06, iron, { bottom: false });
    }
    // timber canopy
    const cA = first ? sA + 3 : 0, cB = last ? sB - 3 : CHUNK, RY = 4.5, px = side * 8.7; // continuous across chunk joins
    const xin = side * 4.55, xr = side * 7.6, xout = side * 10.7, ridgeY = RY + 1.25, eave = RY + 0.12, TH = 0.12;
    let fi = 0;
    for (let s = cA; s <= cB + (last ? 0.01 : -0.01); s += 5, fi++) {
      G.wood.box(px, PH + (RY - PH) / 2, -s, 0.26, RY - PH, 0.26, TIMBER, { uv: 1.2, bottom: false });
      G.flat.box(px, PH + 0.22, -s, 0.44, 0.44, 0.44, STONE, { bottom: false, top: shade(STONE, 1.2) });
      G.wood.box(side * 7.6, RY - 0.13, -s, 6.0, 0.24, 0.2, TIMBER, { uv: 1.2 });
      G.wood.box(xr, RY + 0.6, -s, 0.16, 1.2, 0.16, TIMBER, { uv: 1.2 }); // king post
      G.wood.tube([xin + side * 0.25, eave - 0.1, -s], [xr, ridgeY - 0.1, -s], 0.075, 0.075, 4, TIMBER, { uv: 1.2 });
      G.wood.tube([xout - side * 0.25, eave - 0.1, -s], [xr, ridgeY - 0.1, -s], 0.075, 0.075, 4, TIMBER, { uv: 1.2 });
      G.wood.tube([px, RY - 1.5, -s], [side * 6.5, RY - 0.22, -s], 0.08, 0.08, 4, TIMBER_D, { uv: 1.2 });
      G.wood.tube([px, RY - 0.9, -s], [side * 9.7, RY - 0.22, -s], 0.07, 0.07, 4, TIMBER_D, { uv: 1.2 });
      for (const dz of [-1, 1]) G.wood.tube([px, RY - 0.95, -s], [px, RY - 0.1, -s + dz * 0.85], 0.06, 0.06, 4, TIMBER_D, { uv: 1.2 });
      // enamel-shade lamp
      const lx = side * 6.3;
      G.flat.box(lx, RY - 0.48, -s, 0.03, 0.5, 0.03, iron);
      G.flat.tube([lx, RY - 0.66, -s], [lx, RY - 0.86, -s], 0.05, 0.3, 10, [0.14, 0.3, 0.24]);
      G.flat.tube([lx, RY - 0.86, -s], [lx, RY - 0.66, -s], 0.29, 0.045, 10, [0.9, 0.88, 0.8]);
      G.lamp.blob(lx, RY - 0.86, -s, 0.11, 0.13, 0.11, [1, 0.8, 0.46], 8, 5);
      // hanging name board across the platform, readable as you run in; platform number on the first frame
      if (fi === 3 && first) { // a whole station carries a handful of name boards, not one in every bay
        const hx = side * 7.75, hy = RY - 0.78;
        G.wood.box(hx, hy, -s + 0.4, 2.5, 0.72, 0.06, TIMBER_D, { uv: 1.2 });
        for (const o of [-1.05, 1.05]) G.flat.box(hx + o, hy + 0.5, -s + 0.4, 0.03, 0.34, 0.03, iron);
        plate(G.sign, hx, hy, -s + 0.44, 2.36, 0.59, SIGN_NAME);
        plate(G.sign, hx, hy, -s + 0.36, 2.36, 0.59, SIGN_NAME, 180);
      } else if (fi === 5 && side > 0 && last) { // way-out sign
        const hx = side * 7.75, hy = RY - 0.7;
        G.flat.box(hx, hy, -s + 0.4, 1.4, 0.74, 0.06, iron);
        for (const o of [-0.5, 0.5]) G.flat.box(hx + o, hy + 0.5, -s + 0.4, 0.03, 0.3, 0.03, iron);
        plate(G.deco, hx, hy, -s + 0.44, 1.3, 0.65, DUV('exit'));
        plate(G.deco, hx, hy, -s + 0.36, 1.3, 0.65, DUV('exit'), 180);
      } else if (fi === 1 && !last) {
        const hx = side * 5.75, hy = RY - 0.72;
        G.flat.box(hx, hy, -s + 0.4, 0.6, 0.6, 0.06, iron);
        G.flat.box(hx, hy + 0.42, -s + 0.4, 0.03, 0.26, 0.03, iron);
        plate(G.deco, hx, hy, -s + 0.44, 0.54, 0.54, DUV(side < 0 ? 'p1' : 'p2'));
        plate(G.deco, hx, hy, -s + 0.36, 0.54, 0.54, DUV(side < 0 ? 'p1' : 'p2'), 180);
      }
    }
    const za = -(cA - (first ? 1.2 : 0)), zb = -(cB + (last ? 1.2 : 0)), zm = (za + zb) / 2, zl = Math.abs(zb - za);
    for (const ox of [4.9, 8.7, 10.4]) G.wood.box(side * ox, RY, zm, 0.2, 0.26, zl - (first || last ? 0.8 : 0), TIMBER, { uv: 1.2 });
    for (const t of [0.3, 0.62]) for (const [xa, xb] of [[xin, xr], [xout, xr]]) G.wood.box(lerp(xa, xb, t), lerp(eave, ridgeY, t) - 0.1, zm, 0.12, 0.12, zl - 0.3, TIMBER, { uv: 1.2 });
    {
      const L = zl / 2.2;
      // tiles (with thickness), plank soffit, fascias, barge boards, ridge, gutters
      const slope = (xa, xb) => { // xa = eave x, xb = ridge x
        const front = (xb - xa) * 1 > 0; // normal must point up
        const A = [xa, eave + TH, za], B = [xb, ridgeY + TH, za], C = [xb, ridgeY + TH, zb], D = [xa, eave + TH, zb];
        if (front) G.tile.quad(A, B, C, D, [1, 1, 1], [0, 0, 1.6, L]); else G.tile.quad(B, A, D, C, [1, 1, 1], [0, 0, 1.6, L]);
        const a = [xa, eave, za], b = [xb, ridgeY, za], c = [xb, ridgeY, zb], d = [xa, eave, zb];
        if (front) G.wood.quad(d, c, b, a, shade(TIMBER, 0.7), [0, 0, 3, L * 2]); else G.wood.quad(c, d, a, b, shade(TIMBER, 0.7), [0, 0, 3, L * 2]);
        // eave fascia (faces away from the ridge) and barge boards at both ends
        const out = Math.sign(xa - xb);
        if (out > 0) G.flat.quad([xa, eave - 0.03, za], [xa, eave - 0.03, zb], [xa, eave + TH, zb], [xa, eave + TH, za], ROOF_EDGE);
        else G.flat.quad([xa, eave - 0.03, zb], [xa, eave - 0.03, za], [xa, eave + TH, za], [xa, eave + TH, zb], ROOF_EDGE);
        for (const z of [za, zb]) {
          const p = [xa, eave - 0.03, z], q = [xb, ridgeY - 0.03, z], q2 = [xb, ridgeY + TH, z], p2 = [xa, eave + TH, z];
          G.flat.quad(p, q, q2, p2, ROOF_EDGE); G.flat.quad(q, p, p2, q2, ROOF_EDGE);
        }
        G.shiny.tube([xa + out * 0.07, eave - 0.02, za], [xa + out * 0.07, eave - 0.02, zb], 0.075, 0.075, 6, [0.36, 0.5, 0.46]);
      };
      slope(xin, xr); slope(xout, xr);
      G.flat.box(xr, ridgeY + TH + 0.06, zm, 0.34, 0.2, zl + 0.2, ROOF_EDGE);
      for (const z of [za, zb]) G.flat.box(xr, ridgeY + TH + 0.17, z, 0.42, 0.42, 0.16, shade(ROOF_EDGE, 1.25));
    }
    // name boards on their own legs facing the track, benches, planters
    let bi = 0;
    for (let s = cA + 2.5; s < cB; s += 10, bi++) {
      if (bi === 0 && last && side > 0) { // the one standing board, on the far platform of the last chunk
        const bx = side * 8.45, by = PH + 2.15, hwd = 1.5, hh = 0.42;
        G.wood.box(side * 8.56, by, -s, 0.08, hh * 2 + 0.18, hwd * 2 + 0.18, TIMBER_D, { uv: 1.2 });
        for (const o of [-hwd - 0.02, hwd + 0.02]) G.wood.box(side * 8.56, PH + 1.4, -s + o, 0.1, 2.8, 0.1, TIMBER_D, { uv: 1.2, bottom: false });
        G.wood.box(side * 8.56, by + hh + 0.2, -s, 0.34, 0.07, hwd * 2 + 0.5, TIMBER_D, { uv: 1.2 });
        if (side > 0) G.sign.quad([bx, by - hh, -s - hwd], [bx, by - hh, -s + hwd], [bx, by + hh, -s + hwd], [bx, by + hh, -s - hwd], [1, 1, 1], SIGN_NAME, [-1, 0, 0]);
        else G.sign.quad([bx, by - hh, -s + hwd], [bx, by - hh, -s - hwd], [bx, by + hh, -s - hwd], [bx, by + hh, -s + hwd], [1, 1, 1], SIGN_NAME, [1, 0, 0]);
      } else if (bi === 0) postbox(G, side * 9.55, PH, -s, side);
      else if (bi === 1) { if (side > 0 || Math.abs(s - hs) > hw / 2 + 1) hydrant(G, side * 9.86, PH, -s, side); }
      else if (bi === 2) luggage(G, r, side * 9.5, PH, -s, side);
      bench(G, side * 9.5, PH, -s - 4, -side * 90);
      if (side > 0 || Math.abs(s + 7 - hs) > hw / 2 + 1) planter(G, r, side * 9.75, PH, -s - 7);
    }
    // back fence of white-painted sleepers; it opens in front of the station house
    for (let s = sA + 0.3; s < sB; s += 0.56) {
      if (side < 0 && Math.abs(s - hs) < hw / 2 + 0.5) continue;
      const v = 0.9 + 0.1 * Math.sin(s * 7.3);
      G.plaster.box(side * 10.12, PH + 0.56, -s, 0.1, 1.12 + 0.08 * Math.sin(s * 3.1), 0.2, shade(white, v), { uv: 2, bottom: false });
    }
    if (side > 0) G.plaster.box(side * 10.2, PH + 0.78, zc, 0.05, 0.12, len, shade(white, 0.92), { uv: 2 });
    else for (const [a, b] of [[sA, hs - hw / 2 - 0.5], [hs + hw / 2 + 0.5, sB]]) if (b > a) G.plaster.box(side * 10.2, PH + 0.78, -(a + b) / 2, 0.05, 0.12, b - a, shade(white, 0.92), { uv: 2 });
    // clock hanging under the canopy
    if (first && side > 0) {
      const s = cA + 7.5, hx = side * 5.9, hy = RY - 0.8;
      G.flat.box(hx, hy, -s, 0.72, 0.72, 0.16, iron); G.flat.box(hx, hy + 0.5, -s, 0.04, 0.3, 0.04, iron);
      plate(G.deco, hx, hy, -s + 0.085, 0.64, 0.64, DUV('clock'));
      plate(G.deco, hx, hy, -s - 0.085, 0.64, 0.64, DUV('clock'), 180);
    }
  }
  stationHouse(G, r, -14.75, PH, hs, hw, last);
  // right platform furniture
  {
    const fz = first ? -22 : -8; // vending machines
    for (const [dz, col] of [[0, hex('#c7352a')], [1.2, hex('#e9e6dc')]]) {
      G.shiny.box(9.6, PH + 0.95, fz - dz, 0.72, 1.9, 1.08, col, { bottom: false });
      plate(G.deco, 9.6 - 0.37, PH + 0.95, fz - dz, 1.0, 1.82, DUV('vend'), -90);
      G.lamp.box(9.6 - 0.375, PH + 1.84, fz - dz, 0.02, 0.1, 0.98, [0.9, 0.96, 1]);
    }
    for (const [dz, col] of [[1.4, [0.2, 0.36, 0.56]], [1.95, [0.5, 0.5, 0.48]]]) { // recycling bins
      G.flat.box(9.7, PH + 0.42, fz + dz, 0.46, 0.84, 0.46, col, { bottom: false, top: shade(col, 0.6) });
      G.flat.box(9.46, PH + 0.66, fz + dz, 0.02, 0.1, 0.26, [0.05, 0.05, 0.05]);
    }
    // timetable + posters on a stand against the fence
    const tz = first ? -31 : -19;
    G.wood.box(9.98, PH + 1.5, tz, 0.08, 1.2, 2.3, TIMBER_D, { uv: 1.2 });
    for (const o of [-1.1, 1.1]) G.wood.box(9.98, PH + 1.05, tz + o, 0.1, 2.1, 0.1, TIMBER_D, { uv: 1.2, bottom: false });
    G.flat.box(9.98, PH + 2.16, tz, 0.34, 0.06, 2.6, ROOF_EDGE);
    plate(G.deco, 9.93, PH + 1.5, tz, 2.1, 1.05, DUV('timetable'), -90);
    plate(G.deco, 10.05, PH + 1.6, tz - 2.6, 0.84, 1.05, DUV('poster'), -90);
    G.wood.box(10.09, PH + 1.6, tz - 2.6, 0.05, 1.15, 0.94, TIMBER_D, { uv: 1.2 });
    plate(G.deco, 10.05, PH + 1.9, tz + 2.6, 1.3, 0.65, DUV('exit'), -90);
  }
  // starting signal past the platform end
  if (last) {
    const sx = 6.15, sz = -(sB + 7.5), y0 = groundY(sx, k * CHUNK + sB + 7.5);
    G.flat.tube([sx, y0 - 0.3, sz], [sx, y0 + 5.2, sz], 0.09, 0.07, 6, [0.82, 0.82, 0.8]);
    G.flat.box(sx, y0 + 4.6, sz + 0.06, 0.46, 1.25, 0.16, iron);
    G.flat.box(sx, y0 + 5.25, sz + 0.2, 0.5, 0.04, 0.3, iron);
    G.lamp.blob(sx, y0 + 4.95, sz + 0.15, 0.1, 0.1, 0.05, [0.25, 1, 0.5], 8, 4);
    G.flat.blob(sx, y0 + 4.6, sz + 0.15, 0.1, 0.1, 0.04, [0.3, 0.24, 0.05], 8, 4);
    G.flat.blob(sx, y0 + 4.25, sz + 0.15, 0.1, 0.1, 0.04, [0.3, 0.05, 0.05], 8, 4);
    for (let i = 0; i < 9; i++) G.flat.box(sx + 0.16, y0 + 0.5 + i * 0.4, sz, 0.26, 0.03, 0.03, iron);
    G.flat.box(sx + 0.29, y0 + 2.1, sz, 0.03, 3.6, 0.03, iron);
  }
  const s0 = k * CHUNK;
  for (const side of [-1, 1]) {
    for (let s = r.range(0, 5); s < CHUNK; s += r.range(6.5, 9.5)) {
      const x = side * r.range(side < 0 ? 24 : 12.5, side < 0 ? 30 : 17), y = groundY(x, s0 + s);
      maple(G, r, x, y, -s, r.range(10, 15), { cards: 8, lean: [-side * 0.14, 0] });
    }
    for (let i = 0; i < 8; i++) { const x = side * r.range(30, 78), s = r() * CHUNK; massTree(G, r, x, groundY(x, s0 + s), -s, r.range(13, 20)); }
    // shrubs behind the fence
    for (let s = sA + r.range(1, 3); s < sB; s += r.range(2.2, 4)) {
      if (side < 0 && Math.abs(s - hs) < hw / 2 + 1.5) continue;
      const x = side * r.range(10.9, 11.8);
      bush(G, r, x, groundY(x, s0 + s) + 0.1, -s, r.range(0.8, 1.3), r.pick(['green', 'crimson', 'scarlet', 'amber', 'green']));
    }
    // trees right at the platform ends so the station sits inside the tunnel
    for (const s of [first ? 3 : -1, last ? 37 : -1]) if (s > 0) {
      const x = side * 8.4;
      maple(G, r, x, groundY(x, s0 + s), -s, 11, { cards: 10, lean: [-side * 0.28, 0], bough: [side * 2.4, 10.6, -s] });
    }
  }
  for (let i = 0; i < 3; i++) sunShaft(G, r, r.range(-12, 0), r.range(10, 13), -r.range(0, CHUNK) + 6, r.range(20, 27), r.range(0.8, 1.8), r.range(0.04, 0.09));
}

function bridge(G, r, k) {
  const first = biomeOf(k - 1) !== 'bridge';
  const sA = first ? 10 : 0;
  const v = VERMILION, d = shade(VERMILION, 0.7), TOP = 8.6, X = 6.0, BAY = 5;
  const g = G.shiny;
  for (const side of [-1, 1]) {
    const x = side * X;
    g.box(x, 0.2, -(sA + CHUNK) / 2, 0.42, 0.5, CHUNK - sA, d, { top: v });
    g.box(x, TOP, -(sA + CHUNK) / 2, 0.42, 0.42, CHUNK - sA, v);
    let n = Math.round(sA / BAY);
    for (let s = sA; s < CHUNK + 0.01; s += BAY, n++) {
      if (s < CHUNK) g.box(x, TOP / 2, -s, 0.3, TOP, 0.3, v, { bottom: false });
      if (s + BAY <= CHUNK + 0.01) {
        const up = n % 2 === 0;
        g.tube([x, up ? 0.3 : TOP, -s], [x, up ? TOP : 0.3, -(s + BAY)], 0.13, 0.13, 4, d);
      }
    }
    // walkway rail
    g.box(side * 5.5, 1.1, -(sA + CHUNK) / 2, 0.07, 0.07, CHUNK - sA, shade(STEEL, 0.5));
    for (let s = sA; s < CHUNK; s += 2.5) g.box(side * 5.5, 0.55, -s, 0.05, 1.1, 0.05, shade(STEEL, 0.5), { bottom: false });
  }
  let n = 0;
  for (let s = sA; s < CHUNK; s += BAY, n++) {
    g.box(0, TOP, -s, X * 2, 0.3, 0.3, v);
    if (s + BAY <= CHUNK + 0.01) {
      const fl = n % 2 === 0 ? 1 : -1;
      g.tube([-X * fl, TOP, -s], [X * fl, TOP, -(s + BAY)], 0.09, 0.09, 4, d);
    }
  }
  if (first) { // portal
    g.box(0, TOP - 0.6, -sA, X * 2 + 0.4, 1.2, 0.36, v);
    G.sign.quad([-2.2, TOP - 1.05, -sA + 0.2], [2.2, TOP - 1.05, -sA + 0.2], [2.2, TOP - 0.15, -sA + 0.2], [-2.2, TOP - 0.15, -sA + 0.2], [1, 1, 1], [0, 0.75, 1, 0.5], [0, 0, 1]);
  }
  // deck sides and stone piers
  G.flat.box(0, -0.6, -(sA + CHUNK) / 2, 12.6, 1.1, CHUNK - sA, [0.2, 0.17, 0.16], { top: [0.2, 0.17, 0.16] });
  for (const s of [10, 30]) {
    G.plaster.box(0, -6.4, -s, 9, 11, 3.2, shade(STONE, 0.85), { uv: 3, bottom: false });
    G.plaster.box(0, -1.4, -s, 11, 0.8, 4, STONE, { uv: 3 });
  }
  if (first) { // wooded banks where the land falls away to the water
    for (const side of [-1, 1]) for (let i = 0; i < 26; i++) {
      const x = side * r.range(9, 118), sv = r.range(0, 15), y = groundY(x, k * CHUNK + sv);
      if (y <= -8.6) continue;
      if (Math.abs(x) < 45) maple(G, r, x, y, -sv, r.range(8, 13), { cards: 8 }); else massTree(G, r, x, y, -sv, r.range(11, 18));
    }
  }
  // the lake: rocks with foam, wooded islets, a sailing boat
  const W = -9.6;
  const foam = (x, z, rad) => G.foam.quad([x - rad, W + 0.04, z + rad], [x + rad, W + 0.04, z + rad], [x + rad, W + 0.04, z - rad], [x - rad, W + 0.04, z - rad], [1, 1, 1], [0, 0, 1, 1], [0, 1, 0]);
  for (let i = 0; i < 6; i++) {
    const x = r.sign() * r.range(10, 80), sv = r() * CHUNK, rx = r.range(0.9, 2.6);
    G.flat.blob(x, W - 0.1, -sv, rx, r.range(0.7, 1.4), rx * r.range(0.7, 1.2), shade(STONE, 0.55), 7, 4, shade(STONE, 1.0));
    foam(x, -sv, rx * 1.7);
  }
  for (const sv of [10, 30]) foam(0, -sv, 8.5);
  if (r.chance(0.75)) { // islet
    const x = r.sign() * r.range(26, 70), z = -r.range(8, 32), R = r.range(5, 9);
    G.litter.blob(x, W - 0.6, z, R, 2.0, R * r.range(0.7, 1), [0.5, 0.45, 0.4], 10, 5, [0.95, 0.9, 0.85]);
    for (let i = 0; i < 5; i++) { const a = r() * 6.283, d = R * r.range(0.75, 0.98); G.flat.blob(x + Math.cos(a) * d, W + 0.1, z + Math.sin(a) * d * 0.8, r.range(0.6, 1.3), r.range(0.5, 0.9), r.range(0.6, 1.2), shade(STONE, 0.6), 6, 4, STONE); }
    for (let i = 0; i < 3; i++) maple(G, r, x + r.range(-R, R) * 0.4, W + 1.0, z + r.range(-R, R) * 0.3, r.range(6, 9), { cards: 8 });
    if (r.chance(0.6)) torii(G, x + (x > 0 ? -1 : 1) * R * 0.55, W + 0.9, z, 2.2, 2.6, 90);
    foam(x, z, R * 1.35);
  }
  for (let n = r.int(0, 2); n > 0; n--) { // boats
    const x = r.sign() * r.range(18, 90), z = -r.range(4, 36), ry = r.range(-40, 40) + (x > 0 ? 90 : -90);
    G.wood.at(x, W, z, ry, (g) => {
      g.box(0, 0.25, 0, 1.5, 0.6, 4.2, hex('#7a5236'), { uv: 1.5, top: hex('#a8794e') });
      g.tube([0, 0.5, 0.2], [0, 5.2, 0.2], 0.07, 0.05, 5, hex('#5a3e2a'));
      g.tri([-0.75, 0.25, -2.1], [0.75, 0.25, -2.1], [0, 0.7, -3.3], hex('#7a5236'));
      g.tri([0.75, 0.55, -2.1], [-0.75, 0.55, -2.1], [0, 0.7, -3.3], hex('#a8794e'));
    });
    G.flat.at(x, W, z, ry, (g) => {
      const sail = hex('#f6efe0'), sh = shade(sail, 0.82);
      g.tri([0.02, 0.9, 0.1], [0.02, 5.0, 0.1], [0.02, 0.9, -2.6], sail); g.tri([-0.02, 0.9, 0.1], [-0.02, 0.9, -2.6], [-0.02, 5.0, 0.1], sh);
      g.tri([0.02, 1.0, 0.3], [0.02, 1.0, 1.9], [0.02, 3.9, 0.3], sail); g.tri([-0.02, 1.0, 0.3], [-0.02, 3.9, 0.3], [-0.02, 1.0, 1.9], sh);
    });
    foam(x, z, 2.6);
  }
}

export function buildChunk(device, mats, k) {
  const biome = biomeOf(k);
  const r = rnd(k * 7919 + 1234567);
  const G = newGeos();
  ground(G, k, biome);
  tracks(G, k, biome);
  if (biome === 'forest') {
    forest(G, r, k);
    telegraphPole(G, 6.15, groundY(6.15, k * CHUNK + 20), -20, HAS_POLE(k + 1) ? groundY(6.15, k * CHUNK + 60) : -0.5, HAS_POLE(k + 1));
  } else if (biome === 'paddy') paddies(G, r, k);
  else if (biome === 'station') station(G, r, k);
  else if (biome === 'bridge') bridge(G, r, k);
  // stone abutments where the line leaves solid ground
  if ((biome === 'bridge') !== (biomeOf(k - 1) === 'bridge')) {
    banks(G, r, k);
    G.plaster.box(0, -6.3, -5.5, 12.4, 12, 11, shade(STONE, 0.8), { uv: 3, bottom: false, top: STONE });
  }
  const e = entityFromGeos(device, 'chunk' + k, G, mats);
  e.setLocalPosition(0, 0, -k * CHUNK);
  e._k = k;
  return e;
}

// ---------- backdrop ----------
export function createBackdrop(device, mats) {
  const root = new pc.Entity('backdrop');
  const sunAz = Math.atan2(SUN[0], -SUN[2]);
  // sky dome
  {
    const g = new Geo(), R = 620, SEG = 48, RINGS = 18;
    for (let j = 0; j <= RINGS; j++) {
      const e = lerp(Math.PI / 2, -0.45, j / RINGS);
      for (let i = 0; i <= SEG; i++) {
        const az = -Math.PI + (i / SEG) * Math.PI * 2;
        const dx = Math.sin(az) * Math.cos(e), dy = Math.sin(e), dz = -Math.cos(az) * Math.cos(e);
        g.vert(dx * R, dy * R, dz * R, -dx, -dy, -dz, 0.5 + (az - sunAz) / (Math.PI * 2), 0.5 - e / Math.PI);
      }
    }
    for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i, b = a + SEG + 1;
      g.i.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const e = entityFromGeos(device, 'sky', { sky: g }, mats);
    e.render.castShadows = false; e.render.receiveShadows = false;
    root.addChild(e);
  }
  // ridges
  const ring = (key, R, y0, y1, rep, rot) => {
    const g = new Geo(), SEG = 64;
    for (let i = 0; i <= SEG; i++) {
      const az = (i / SEG) * Math.PI * 2 + rot;
      const x = Math.sin(az) * R, z = -Math.cos(az) * R;
      g.vert(x, y0, z, 0, 0, 1, (i / SEG) * rep, 1);
      g.vert(x, y1, z, 0, 0, 1, (i / SEG) * rep, 0);
    }
    for (let i = 0; i < SEG; i++) { const a = i * 2; g.i.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    const e = entityFromGeos(device, key, { [key]: g }, mats);
    e.render.castShadows = false; e.render.receiveShadows = false;
    root.addChild(e);
  };
  ring('ridgeFar', 590, -30, 150, 2, 0.4);
  ring('ridgeMid', 520, -30, 92, 3, 1.9);
  ring('ridgeNear', 420, -22, 46, 4, 0.9);
  // river
  {
    const g = new Geo();
    const S = 460, uv = S / 14;
    g.quad([-S, 0, S], [S, 0, S], [S, 0, -S], [-S, 0, -S], [1, 1, 1], [0, 0, uv, uv], [0, 1, 0]);
    const e = entityFromGeos(device, 'water', { water: g }, mats);
    e.setLocalPosition(0, -9.6, 0);
    e.render.castShadows = false;
    root.addChild(e);
    root._water = e;
  }
  return root;
}
