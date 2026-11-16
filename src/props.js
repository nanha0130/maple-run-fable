// Shared meshes for everything that sits on the line: train cars (from train.glb), hurdles, gates, ramps,
// golden leaves and the four power-ups.
import * as pc from 'playcanvas';
import { Geo, hex, shade, mat } from './gfx.js';
import { mapleOutline } from './art.js';
import { TRAIN_TOP } from './world.js';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

async function loadGlbPrims(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const bin = 20 + jsonLen + 8;
  const read = (idx) => {
    const a = json.accessors[idx], bv = json.bufferViews[a.bufferView];
    const off = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const n = a.count * COMPONENTS[a.type];
    const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    return new T(buf.slice(off, off + n * T.BYTES_PER_ELEMENT));
  };
  return json.meshes[0].primitives.map((p) => ({
    name: json.materials[p.material].name.replace(/\.\d+$/, ''),
    pos: read(p.attributes.POSITION), nrm: read(p.attributes.NORMAL), uv: read(p.attributes.TEXCOORD_0),
    col: read(p.attributes.COLOR_0), idx: read(p.indices),
  }));
}

// a permanent reference, so pooled entities can come and go without freeing the shared mesh
const keep = (mesh) => { if (mesh) mesh.incRefCount(); return mesh; };

function mergePrims(device, prims, recolor) {
  let nv = 0, ni = 0;
  for (const p of prims) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Uint8Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of prims) {
    const n = p.pos.length / 3;
    pos.set(p.pos, vo * 3); nrm.set(p.nrm, vo * 3); uv.set(p.uv, vo * 2);
    const rc = recolor && recolor[p.name];
    for (let i = 0; i < n; i++) {
      let r = p.col[i * 4] / 257, g = p.col[i * 4 + 1] / 257, b = p.col[i * 4 + 2] / 257;
      if (rc) { const c = rc(r, g, b); r = c[0]; g = c[1]; b = c[2]; }
      col[(vo + i) * 4] = r; col[(vo + i) * 4 + 1] = g; col[(vo + i) * 4 + 2] = b; col[(vo + i) * 4 + 3] = 255;
    }
    for (let i = 0; i < p.idx.length; i++) idx[io + i] = p.idx[i] + vo;
    vo += n; io += p.idx.length;
  }
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos); mesh.setNormals(nrm); mesh.setUvs(0, uv); mesh.setColors32(col); mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return keep(mesh);
}

export async function createProps(device, mats, tx) {
  const P = {};

  // ---- train
  const prims = await loadGlbPrims('./models/train.glb');
  const by = (names) => prims.filter((p) => names.includes(p.name));
  const lin = (c) => c.map((v) => Math.pow(v, 2.2) * 255);
  const GREEN = lin(hex('#1f6a4a')), GREEN_D = lin(hex('#17523a'));
  const greenify = {
    paint_lower: () => GREEN,
    // the model's stripe / accent colours are the saturated ones; the cream body stays
    paint: (r, g, b) => (r > 150 && b < 60 ? GREEN_D : [r, g, b]),
  };
  const destPrim = by(['dest'])[0];
  if (destPrim) for (let i = 0; i < destPrim.uv.length; i += 2) destPrim.uv[i + 1] = 0.5 + destPrim.uv[i + 1] * 0.25;
  const bodyNames = ['paint', 'paint_lower', 'dielectric', 'metal', 'decal'];
  // windows: dark reflective glass with a little cabin light, not a flat lit panel
  const WINDOW = lin([0.1, 0.12, 0.15]);
  const asGlass = { glass: () => WINDOW };
  const tm = {
    body: mat({ vc: true, gloss: 0.84, env: true }),
    glass: mat({ vc: true, gloss: 0.97, metal: 0.28, env: true, emissive: [1, 0.66, 0.34], emissiveIntensity: 0.05 }),
    lamps: mat({ vc: true, emissiveVc: true, emissive: [1, 1, 1], emissiveIntensity: 3 }),
    head: mat({ vc: true, emissiveVc: true, emissive: [1, 1, 1], emissiveIntensity: 2.2 }),
    headOn: mat({ vc: true, emissiveVc: true, emissive: [1, 1, 1], emissiveIntensity: 14 }),
    dest: mat({ map: tx.signs, emissiveMap: tx.signs, emissive: [1, 1, 1], emissiveIntensity: 1.6 }),
  };
  const lampMesh = mergePrims(device, by(['taillight', 'ceiling_light']));
  const glassMesh = mergePrims(device, by(['glass']), asGlass);
  const headMesh = mergePrims(device, by(['headlight']));
  const destMesh = destPrim ? mergePrims(device, [destPrim]) : null;
  const bodies = { maroon: mergePrims(device, by(bodyNames)), green: mergePrims(device, by(bodyNames), greenify) };
  // roof kit: a folded pantograph (low enough to run over) and air-conditioning housings, so the roofs you run on are not bare
  const kit = new Geo();
  {
    const st = hex('#3a3c40'), al = hex('#b9bcc0'), cu = hex('#b0683a');
    for (const z of [-3.6, -11.4]) {
      kit.box(0, 3.6, z, 1.7, 0.2, 2.6, shade(al, 0.75), { top: al, bottom: false });
      for (let i = -1; i <= 1; i++) kit.tube([i * 0.5, 3.71, z - 0.9], [i * 0.5, 3.71, z + 0.9], 0.2, 0.2, 10, st);
    }
    // ---- body detail, measured off the model's own window and door openings
    const dk = hex('#26282c'), trim = hex('#c9ccd0'), brass = hex('#c9a04a'), rub = hex('#141416');
    const WIN = [[-2.35, -0.95, 2.02], [-5.85, -4.55, 1.97], [-7.35, -6.05, 1.97], [-8.85, -7.55, 1.97], [-10.35, -9.05, 1.97], [-14.05, -12.65, 2.02]];
    const DOORS = [-3.4, -11.6];
    for (const sx of [-1, 1]) {
      const X = sx * 1.345;
      for (const [z0, z1, y0] of WIN) { // aluminium frames + sill
        const zc2 = (z0 + z1) / 2, w = z1 - z0, y1 = 2.68;
        kit.box(X, y1 + 0.02, zc2, 0.03, 0.04, w + 0.1, trim); kit.box(X, y0 - 0.025, zc2, 0.05, 0.05, w + 0.14, trim);
        kit.box(X, (y0 + y1) / 2, z0 - 0.025, 0.03, y1 - y0 + 0.06, 0.04, trim); kit.box(X, (y0 + y1) / 2, z1 + 0.025, 0.03, y1 - y0 + 0.06, 0.04, trim);
        if (w > 1.35) kit.box(X, (y0 + y1) / 2, zc2, 0.025, y1 - y0, 0.03, trim); // centre mullion
      }
      for (const dz of DOORS) { // double doors: seams, header, kick plate, step, grab rails
        for (const o of [-0.63, 0, 0.63]) kit.box(X, 2.08, dz + o, 0.02, 1.95, o === 0 ? 0.035 : 0.05, rub);
        kit.box(X, 3.07, dz, 0.03, 0.05, 1.32, rub);
        for (const o of [-0.32, 0.32]) {
          kit.box(X, 2.32, dz + o, 0.03, 0.04, 0.5, trim); kit.box(X, 1.94, dz + o, 0.03, 0.04, 0.5, trim);
          kit.box(X, 1.38, dz + o, 0.025, 0.42, 0.5, shade(trim, 0.8));
        }
        kit.box(sx * 1.4, 1.13, dz, 0.16, 0.05, 1.3, shade(trim, 0.7), { top: trim });
        for (const o of [-0.74, 0.74]) kit.tube([sx * 1.385, 1.5, dz + o], [sx * 1.385, 2.6, dz + o], 0.018, 0.018, 5, brass);
      }
      kit.box(sx * 1.36, 3.31, -7.5, 0.05, 0.05, 15, dk);                 // rain gutter
      kit.box(X, 1.9, -7.5, 0.012, 0.035, 14.9, brass);                    // waist line
      kit.box(X, 1.24, -7.5, 0.012, 0.03, 14.9, brass);
      // underfloor equipment between the bogies
      for (const [z, len2, h] of [[-5.6, 1.5, 0.5], [-7.3, 1.2, 0.42], [-8.8, 1.6, 0.52], [-10.2, 0.8, 0.36]]) {
        kit.box(sx * 0.98, 1.06 - h / 2, z, 0.5, h, len2, dk, { top: shade(dk, 1.4) });
        for (let i = 0; i < 4; i++) kit.box(sx * 1.235, 1.06 - h / 2, z - len2 * 0.3 + i * len2 * 0.2, 0.01, h * 0.6, len2 * 0.1, shade(dk, 1.9));
      }
      kit.tube([sx * 0.7, 0.72, -5], [sx * 0.7, 0.72, -10.4], 0.05, 0.05, 6, shade(dk, 1.5));   // air pipe
      // cab: wiper, lamp bezel, corner grab rail
      kit.tube([sx * 0.42, 2.02, 0.05], [sx * 0.86, 2.5, 0.05], 0.014, 0.014, 4, rub);
      kit.box(sx * 0.42, 2.0, 0.05, 0.07, 0.05, 0.03, rub);
      kit.tube([sx * 1.28, 1.5, 0.06], [sx * 1.28, 2.7, 0.06], 0.016, 0.016, 5, brass);
      kit.box(sx * 0.78, 1.52, 0.055, 0.5, 0.04, 0.03, trim); kit.box(sx * 0.78, 1.36, 0.055, 0.5, 0.04, 0.03, trim);
    }
    // cab front: coupler, skirt, number plate, roof horn + antenna
    kit.box(0, 0.86, 0.34, 0.3, 0.26, 0.56, dk, { top: shade(dk, 1.5) });
    kit.box(0, 0.86, 0.66, 0.4, 0.34, 0.12, shade(dk, 1.6));
    for (const sx of [-1, 1]) {
      kit.quad([sx * 0.25, 0.42, 0.42], [sx * 1.3, 0.42, 0.08], [sx * 1.3, 1.0, 0.04], [sx * 0.25, 1.0, 0.3], sx > 0 ? dk : shade(dk, 1.3));
      kit.quad([sx * 1.3, 0.42, 0.08], [sx * 0.25, 0.42, 0.42], [sx * 0.25, 1.0, 0.3], [sx * 1.3, 1.0, 0.04], sx > 0 ? shade(dk, 1.3) : dk);
    }
    kit.box(0, 1.34, 0.055, 0.5, 0.2, 0.02, hex('#f3ecd8')); kit.box(0, 1.34, 0.06, 0.4, 0.035, 0.02, dk);
    kit.tube([0.5, 3.52, -0.5], [0.5, 3.52, -0.95], 0.06, 0.09, 8, trim, { cap: true });
    kit.tube([-0.6, 3.5, -1.2], [-0.6, 4.05, -1.25], 0.012, 0.008, 4, dk);
    // rear: gangway bellows and coupler
    for (let i = 0; i < 5; i++) kit.box(0, 2.12, -15.06 - i * 0.07, 1.0 + (i % 2) * 0.08, 1.95 + (i % 2) * 0.08, 0.07, i % 2 ? dk : rub);
    kit.box(0, 0.86, -15.3, 0.3, 0.26, 0.5, dk);
    // roof ribs
    for (let z = -0.9; z > -14.6; z -= 0.95) kit.box(0, 3.5, z, 2.3, 0.03, 0.05, shade(al, 0.7));
    const base = 3.56, zc = -7.5;
    kit.box(0, base, zc, 1.3, 0.08, 1.5, st);
    for (const sx of [-0.55, 0.55]) {
      kit.tube([sx, base, zc - 0.6], [sx * 0.6, base + 0.2, zc + 0.5], 0.03, 0.03, 5, st);
      kit.tube([sx * 0.6, base + 0.2, zc + 0.5], [sx * 0.8, base + 0.3, zc - 0.35], 0.03, 0.03, 5, st);
      for (const zz of [-0.6, 0.6]) kit.tube([sx, base - 0.02, zc + zz], [sx, base + 0.14, zc + zz], 0.07, 0.05, 6, hex('#d8d2c4'));
    }
    kit.tube([-0.33, base + 0.2, zc + 0.5], [0.33, base + 0.2, zc + 0.5], 0.025, 0.025, 5, st);
    for (const dz of [-0.14, 0.14]) kit.tube([-0.95, base + 0.32, zc - 0.35 + dz], [0.95, base + 0.32, zc - 0.35 + dz], 0.028, 0.028, 5, cu);
  }
  const kitMesh = keep(kit.build(device));
  P.car = (livery = 'maroon', lit = false) => {
    const e = new pc.Entity('car');
    const mis = [
      new pc.MeshInstance(bodies[livery], tm.body), new pc.MeshInstance(glassMesh, tm.glass),
      new pc.MeshInstance(lampMesh, tm.lamps), new pc.MeshInstance(headMesh, lit ? tm.headOn : tm.head),
    ];
    if (destMesh) mis.push(new pc.MeshInstance(destMesh, tm.dest));
    mis.push(new pc.MeshInstance(kitMesh, mats.shiny));
    e.addComponent('render', { meshInstances: mis, castShadows: true, receiveShadows: true });
    mis[2].castShadow = false; mis[3].castShadow = false;
    return e;
  };

  const make = (geos, extra = {}) => () => {
    const e = new pc.Entity();
    const mis = [];
    for (const k of Object.keys(geos)) { const mi = new pc.MeshInstance(geos[k], extra[k] || mats[k]); if ((extra[k] || mats[k])._noShadow) mi.castShadow = false; mis.push(mi); }
    e.addComponent('render', { meshInstances: mis, castShadows: true, receiveShadows: true });
    for (const mi of mis) if (mi.material._noShadow) mi.castShadow = false;
    return e;
  };
  const built = (G) => { const o = {}; for (const k of Object.keys(G)) { const m = keep(G[k].build(device)); if (m) o[k] = m; } return o; };

  // ---- hurdle: crossing barrier, jump it
  {
    const G = { flat: new Geo(), hazard: new Geo(), lamp: new Geo() };
    const dk = [0.13, 0.12, 0.12];
    for (const sx of [-1.28, 1.28]) {
      G.flat.box(sx, 0.52, 0, 0.12, 1.04, 0.12, dk, { bottom: false });
      G.flat.box(sx, 0.05, 0, 0.3, 0.1, 0.7, dk, { bottom: false });
      G.lamp.blob(sx, 1.1, 0, 0.09, 0.09, 0.09, [1, 0.25, 0.1], 6, 4);
    }
    G.hazard.box(0, 0.8, 0, 2.68, 0.34, 0.09, [1, 1, 1], { uv: 0.34 });
    G.hazard.box(0, 0.36, 0, 2.68, 0.14, 0.07, [1, 1, 1], { uv: 0.34 });
    P.hurdle = make(built(G));
  }

  // ---- gate: roll under it
  P.blink = mat({ vc: true, emissiveVc: true, emissive: [1, 1, 1], emissiveIntensity: 5 });
  {
    const G = { flat: new Geo(), redwhite: new Geo(), sign: new Geo(), blink: new Geo(), hazard: new Geo() };
    const steel = hex('#55504c');
    for (const sx of [-1.44, 1.44]) {
      G.flat.box(sx, 1.75, 0, 0.14, 3.5, 0.14, steel, { bottom: false });
      G.hazard.box(sx, 0.35, 0, 0.2, 0.7, 0.2, [1, 1, 1], { uv: 0.35, bottom: false });
    }
    G.flat.box(0, 3.5, 0, 3.1, 0.16, 0.18, steel);
    G.redwhite.box(0, 1.5, 0, 2.86, 0.3, 0.12, [1, 1, 1], { uv: 0.5 });
    for (const sx of [-0.95, 0.95]) G.flat.box(sx, 2.6, 0, 0.05, 1.8, 0.05, steel);
    G.flat.box(0, 2.25, -0.03, 2.3, 0.9, 0.05, [0.1, 0.1, 0.1]);
    G.sign.quad([-1.1, 1.84, 0.01], [1.1, 1.84, 0.01], [1.1, 2.66, 0.01], [-1.1, 2.66, 0.01], [1, 1, 1], [0, 0.5, 1, 0.25], [0, 0, 1]);
    for (const sx of [-1.44, 1.44]) G.blink.blob(sx, 3.72, 0, 0.14, 0.14, 0.14, [1, 0.12, 0.06], 8, 5);
    P.gate = make(built(G), { blink: P.blink });
  }

  // ---- ramp: 7 m of planks up to roof height (forward = -z)
  {
    const L = 7, H = TRAIN_TOP, W = 2.7;
    const G = { wood: new Geo(), flat: new Geo(), hazard: new Geo() };
    const tim = hex('#b08a5e'), dark = hex('#5a3e2a');
    G.wood.quad([-W / 2, 0.02, 0], [W / 2, 0.02, 0], [W / 2, H, -L], [-W / 2, H, -L], tim, [0, 0, 1.6, 4.4]);
    G.wood.quad([W / 2, -0.1, 0], [-W / 2, -0.1, 0], [-W / 2, H - 0.12, -L], [W / 2, H - 0.12, -L], dark, [0, 0, 1.6, 4.4]);
    for (const sx of [-1, 1]) {
      const x = sx * W / 2;
      // side stringer
      const a = [x, 0.02, 0], b = [x, H, -L], c = [x, H - 0.3, -L], d = [x, -0.1, 0];
      if (sx > 0) G.flat.quad(d, c, b, a, dark); else G.flat.quad(a, b, c, d, dark);
      // trestle legs
      for (const t of [0.34, 0.62, 0.9]) {
        const z = -L * t, y = H * t;
        G.wood.box(x * 0.92, y / 2 - 0.1, z, 0.16, y, 0.16, dark, { uv: 1.2, bottom: false });
      }
      // kerb so the edge reads from behind
      G.hazard.at(x * 0.97, 0, 0, 0, (g) => g.quad([-0.06, 0.06, 0], [0.06, 0.06, 0], [0.06, H + 0.04, -L], [-0.06, H + 0.04, -L], [1, 1, 1], [0, 0, 0.35, 22]));
    }
    for (const t of [0.34, 0.62, 0.9]) G.wood.box(0, H * t - 0.3, -L * t, W * 0.9, 0.12, 0.12, dark, { uv: 1.2 });
    G.flat.box(0, H / 2 - 0.2, -L + 0.06, W, H - 0.4, 0.1, dark, { bottom: false });
    P.ramp = make(built(G));
    P.RAMP_LEN = L;
  }

  // ---- golden maple leaf (extruded outline)
  {
    const g = new Geo();
    const pts = mapleOutline().map(([x, y]) => [x * 0.72, y * 0.72 + 0.03]);
    const T = 0.045, gold = hex('#ffd24a'), edge = hex('#f39a1e'), mid = hex('#fff0a0');
    for (const f of [1, -1]) {
      const c0 = g.vert(0, 0, f * T, 0, 0, f, 0.5, 0.5, mid);
      const base = g.count;
      pts.forEach(([x, y]) => g.vert(x, y, f * T, 0, 0, f, 0, 0, Math.hypot(x, y) > 0.44 ? edge : gold));
      for (let i = 0; i < pts.length; i++) {
        const a = base + i, b = base + ((i + 1) % pts.length);
        if (f > 0) g.i.push(c0, b, a); else g.i.push(c0, a, b);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      g.quad([x1, y1, T], [x0, y0, T], [x0, y0, -T], [x1, y1, -T], edge);
    }
    g.tube([0, -0.12, 0], [0.04, -0.5, 0], 0.03, 0.02, 5, edge);
    const mesh = keep(g.build(device));
    const m = mat({ vc: true, gloss: 0.85, twoSided: true, emissiveVc: true, emissive: [1, 0.8, 0.45], emissiveIntensity: 1.5 });
    P.leaf = () => {
      const e = new pc.Entity('leaf');
      const mi = new pc.MeshInstance(mesh, m); mi.castShadow = false;
      e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
      return e;
    };
  }

  // ---- power-ups
  const glowCard = (g, s, c) => g.quad([-s, -s, -0.05], [s, -s, -0.05], [s, s, -0.05], [-s, s, -0.05], c, [0, 0, 1, 1], [0, 0, 1]);
  const pw = {};
  { // wind: pinwheel
    const G = { flat: new Geo(), glow: new Geo() };
    const red = hex('#e23a2a'), white = hex('#fff4e0');
    for (let i = 0; i < 4; i++) {
      G.flat.at(0, 0, 0, 0, (g) => {
        g.tri([0, 0, 0.03], [0.5, 0, 0.03], [0.5, 0.5, 0.1], i % 2 ? red : white);
        g.tri([0, 0, 0.03], [0.5, 0.5, 0.1], [0.5, 0, 0.03], i % 2 ? shade(red, 0.7) : shade(white, 0.8));
        g.tri([0, 0, 0.03], [0.5, 0.5, 0.1], [0, 0.34, 0.03], i % 2 ? white : red);
        g.tri([0, 0, 0.03], [0, 0.34, 0.03], [0.5, 0.5, 0.1], i % 2 ? shade(white, 0.8) : shade(red, 0.7));
      }, 0, i * 90);
    }
    G.flat.blob(0, 0, 0.1, 0.07, 0.07, 0.05, hex('#f4c20d'), 8, 4);
    glowCard(G.glow, 1.1, [0.5, 0.75, 0.9]);
    pw.wind = built(G);
  }
  { // magnet
    const G = { shiny: new Geo(), glow: new Geo() };
    const red = hex('#d8322a'), tip = hex('#e9e6e0');
    const N = 10, R = 0.3, r = 0.1;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N);
      G.shiny.tube([Math.cos(a0) * R, Math.sin(a0) * R + 0.05, 0], [Math.cos(a1) * R, Math.sin(a1) * R + 0.05, 0], r, r, 8, red);
    }
    for (const sx of [-1, 1]) {
      G.shiny.tube([sx * R, 0.05, 0], [sx * R, -0.2, 0], r, r, 8, red);
      G.shiny.tube([sx * R, -0.2, 0], [sx * R, -0.42, 0], r * 1.02, r * 1.02, 8, tip, { cap: true });
    }
    glowCard(G.glow, 1.1, [0.9, 0.35, 0.3]);
    pw.magnet = built(G);
  }
  { // x2: paper lantern
    const G = { lamp: new Geo(), flat: new Geo(), glow: new Geo() };
    G.lamp.blob(0, 0, 0, 0.36, 0.42, 0.36, [1, 0.42, 0.16], 12, 8, [1, 0.62, 0.25]);
    for (const y of [-0.42, 0.42]) G.flat.tube([0, y - 0.05, 0], [0, y + 0.05, 0], 0.17, 0.17, 10, [0.1, 0.09, 0.09], { cap: true });
    G.flat.box(0, 0.6, 0, 0.03, 0.26, 0.03, [0.1, 0.09, 0.09]);
    for (let i = 0; i < 5; i++) G.flat.tube([0, -0.28 + i * 0.14 - 0.008, 0], [0, -0.28 + i * 0.14 + 0.008, 0], 0.37 * Math.sqrt(1 - ((-0.28 + i * 0.14) / 0.42) ** 2) + 0.012, 0.37 * Math.sqrt(1 - ((-0.28 + i * 0.14) / 0.42) ** 2) + 0.012, 12, [0.55, 0.12, 0.05]);
    glowCard(G.glow, 1.2, [1, 0.55, 0.2]);
    pw.x2 = built(G);
  }
  { // shield: omamori charm
    const G = { flat: new Geo(), shiny: new Geo(), glow: new Geo() };
    const silk = hex('#7a2fb0'), gold = hex('#f4c64a');
    G.flat.box(0, -0.05, 0, 0.5, 0.7, 0.1, silk);
    G.flat.tri([-0.25, 0.3, 0.05], [0.25, 0.3, 0.05], [0, 0.48, 0.05], silk);
    G.flat.tri([0.25, 0.3, -0.05], [-0.25, 0.3, -0.05], [0, 0.48, -0.05], silk);
    G.shiny.box(0, -0.05, 0, 0.2, 0.46, 0.12, gold);
    G.shiny.box(0, 0.3, 0, 0.52, 0.05, 0.12, gold);
    G.shiny.blob(0, 0.52, 0, 0.07, 0.07, 0.07, gold, 8, 4);
    glowCard(G.glow, 1.1, [0.7, 0.4, 1]);
    pw.shield = built(G);
  }
  P.power = (kind) => make(pw[kind])();

  // ---- headlight flare for oncoming trains
  {
    const g = new Geo();
    for (const sx of [-0.8, 0.8]) g.quad([sx - 1.5, 0.3, 0.2], [sx + 1.5, 0.3, 0.2], [sx + 1.5, 2.8, 0.2], [sx - 1.5, 2.8, 0.2], [1, 0.9, 0.62], [0, 0, 1, 1], [0, 0, 1]);
    const mesh = keep(g.build(device));
    P.flare = () => {
      const e = new pc.Entity('flare');
      const mi = new pc.MeshInstance(mesh, mats.glow); mi.castShadow = false;
      e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
      return e;
    };
  }
  return P;
}
