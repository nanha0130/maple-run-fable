// Geometry accumulator + material / texture helpers on top of PlayCanvas.
import * as pc from 'playcanvas';

export const rnd = (seed) => {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
};

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));

export const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const shade = (c, k) => [clamp(c[0] * k, 0, 1), clamp(c[1] * k, 0, 1), clamp(c[2] * k, 0, 1)];

const WHITE = [1, 1, 1];
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) LIN[i] = Math.pow(i / 255, 2.2) * 255;

export class Geo {
  constructor() {
    this.p = []; this.n = []; this.u = []; this.c = []; this.i = [];
    this.m = null; // optional Float32Array(16) column-major transform
  }

  get count() { return this.p.length / 3; }

  /** Run fn with a TRS transform applied (translation, yaw/pitch/roll in degrees, uniform scale). Nestable. */
  at(x, y, z, ry, fn, rx = 0, rz = 0, s = 1) {
    const prev = this.m;
    const t = new pc.Mat4().setTRS(new pc.Vec3(x, y, z), new pc.Quat().setFromEulerAngles(rx, ry, rz), new pc.Vec3(s, s, s));
    if (prev) { const pm = new pc.Mat4(); pm.data.set(prev); t.mul2(pm, t); }
    this.m = t.data.slice();
    fn(this);
    this.m = prev;
  }

  vert(x, y, z, nx, ny, nz, u, v, col = WHITE, a = 1) {
    const m = this.m;
    if (m) {
      const px = m[0] * x + m[4] * y + m[8] * z + m[12];
      const py = m[1] * x + m[5] * y + m[9] * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const qx = m[0] * nx + m[4] * ny + m[8] * nz;
      const qy = m[1] * nx + m[5] * ny + m[9] * nz;
      const qz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(qx, qy, qz) || 1;
      x = px; y = py; z = pz; nx = qx / l; ny = qy / l; nz = qz / l;
    }
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v);
    // vertex colours are authored in sRGB; the shader reads them as linear
    this.c.push(LIN[(col[0] * 255) | 0], LIN[(col[1] * 255) | 0], LIN[(col[2] * 255) | 0], a * 255);
    return this.p.length / 3 - 1;
  }

  /** Quad from four corners (counter-clockwise seen from the front). */
  quad(a, b, c, d, col = WHITE, uv = [0, 0, 1, 1], nrm = null, col2 = null) {
    let nx, ny, nz;
    if (nrm) { [nx, ny, nz] = nrm; } else {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, uv[0], uv[1], col);
    this.vert(b[0], b[1], b[2], nx, ny, nz, uv[2], uv[1], col);
    this.vert(c[0], c[1], c[2], nx, ny, nz, uv[2], uv[3], col2 || col);
    this.vert(d[0], d[1], d[2], nx, ny, nz, uv[0], uv[3], col2 || col);
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  tri(a, b, c, col = WHITE, uvs = [0, 0, 1, 0, 0.5, 1]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, uvs[0], uvs[1], col);
    this.vert(b[0], b[1], b[2], nx, ny, nz, uvs[2], uvs[3], col);
    this.vert(c[0], c[1], c[2], nx, ny, nz, uvs[4], uvs[5], col);
    this.i.push(i0, i0 + 1, i0 + 2);
  }

  /**
   * Axis-aligned box centred at (cx,cy,cz). `uv` = metres per texture repeat.
   * opts: top (colour for the +Y face), bottom:false to skip the -Y face, dark (multiplier for -Y/side shading).
   */
  box(cx, cy, cz, sx, sy, sz, col = WHITE, opts = {}) {
    const uvs = opts.uv || 1;
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    const top = opts.top || col;
    const U = (a) => a / uvs;
    // +Y
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top, [U(x0), U(z1), U(x1), U(z0)]);
    if (opts.bottom !== false) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, [U(x0), U(z0), U(x1), U(z1)]);
    // +Z / -Z
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, [U(x0), U(y0), U(x1), U(y1)]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, [U(x1), U(y0), U(x0), U(y1)]);
    // +X / -X
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, [U(z1), U(y0), U(z0), U(y1)]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, [U(z0), U(y0), U(z1), U(y1)]);
  }

  /** Tapered tube from point a to point b. */
  tube(a, b, r0, r1, seg = 6, col = WHITE, opts = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    const ax = dx / len, ay = dy / len, az = dz / len;
    // perpendicular basis
    let px = 0, py = 0, pz = 1;
    if (Math.abs(az) > 0.9) { px = 1; pz = 0; }
    let ux = ay * pz - az * py, uy = az * px - ax * pz, uz = ax * py - ay * px;
    let l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
    const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
    const uvs = opts.uv || 1;
    const col2 = opts.col2 || col;
    const base = this.count;
    for (let s = 0; s <= seg; s++) {
      const t = (s / seg) * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn;
      const uu = (s / seg) * Math.max(1, Math.round((2 * Math.PI * r0) / uvs));
      this.vert(a[0] + nx * r0, a[1] + ny * r0, a[2] + nz * r0, nx, ny, nz, uu, 0, col);
      this.vert(b[0] + nx * r1, b[1] + ny * r1, b[2] + nz * r1, nx, ny, nz, uu, len / uvs, col2);
    }
    for (let s = 0; s < seg; s++) {
      const i0 = base + s * 2;
      this.i.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
    }
    if (opts.cap) {
      const c0 = this.vert(b[0], b[1], b[2], ax, ay, az, 0.5, 0.5, col2);
      for (let s = 0; s < seg; s++) {
        const t0 = (s / seg) * Math.PI * 2, t1 = ((s + 1) / seg) * Math.PI * 2;
        const i1 = this.vert(b[0] + (ux * Math.cos(t0) + vx * Math.sin(t0)) * r1, b[1] + (uy * Math.cos(t0) + vy * Math.sin(t0)) * r1, b[2] + (uz * Math.cos(t0) + vz * Math.sin(t0)) * r1, ax, ay, az, 0, 0, col2);
        const i2 = this.vert(b[0] + (ux * Math.cos(t1) + vx * Math.sin(t1)) * r1, b[1] + (uy * Math.cos(t1) + vy * Math.sin(t1)) * r1, b[2] + (uz * Math.cos(t1) + vz * Math.sin(t1)) * r1, ax, ay, az, 1, 0, col2);
        this.i.push(c0, i1, i2);
      }
    }
  }

  /** Free-oriented card: centre, half-right vector, half-up vector, shading normal. */
  card(c, r, u, nrm, col = WHITE, uv = [0, 0, 1, 1], colTop = null) {
    const i0 = this.vert(c[0] - r[0] - u[0], c[1] - r[1] - u[1], c[2] - r[2] - u[2], nrm[0], nrm[1], nrm[2], uv[0], uv[1], col);
    this.vert(c[0] + r[0] - u[0], c[1] + r[1] - u[1], c[2] + r[2] - u[2], nrm[0], nrm[1], nrm[2], uv[2], uv[1], col);
    this.vert(c[0] + r[0] + u[0], c[1] + r[1] + u[1], c[2] + r[2] + u[2], nrm[0], nrm[1], nrm[2], uv[2], uv[3], colTop || col);
    this.vert(c[0] - r[0] + u[0], c[1] - r[1] + u[1], c[2] - r[2] + u[2], nrm[0], nrm[1], nrm[2], uv[0], uv[3], colTop || col);
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  /** Low-poly ellipsoid (for lanterns, fruit, boulders). */
  blob(cx, cy, cz, rx, ry, rz, col = WHITE, seg = 8, rings = 5, colTop = null) {
    const base = this.count;
    for (let r = 0; r <= rings; r++) {
      const ph = (r / rings) * Math.PI;
      const y = Math.cos(ph), rad = Math.sin(ph);
      const cc = colTop ? mix(col, colTop, (y + 1) / 2) : col;
      for (let s = 0; s <= seg; s++) {
        const th = (s / seg) * Math.PI * 2;
        const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
        this.vert(cx + x * rx, cy + y * ry, cz + z * rz, x, y, z, s / seg, r / rings, cc);
      }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
      const i0 = base + r * (seg + 1) + s, i1 = i0 + seg + 1;
      this.i.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
    }
  }

  build(device, tangents = false) {
    if (!this.i.length) return null;
    const mesh = new pc.Mesh(device);
    mesh.setPositions(new Float32Array(this.p));
    mesh.setNormals(new Float32Array(this.n));
    mesh.setUvs(0, new Float32Array(this.u));
    mesh.setColors32(new Uint8Array(this.c));
    mesh.setIndices(this.count > 65535 ? new Uint32Array(this.i) : new Uint16Array(this.i));
    if (tangents) mesh.setVertexStream(pc.SEMANTIC_TANGENT, pc.calculateTangents(this.p, this.n, this.u, this.i), 4);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
  }
}

/** Build an entity from { materialKey: Geo } using a material table. */
export function entityFromGeos(device, name, geos, mats, opts = {}) {
  const e = new pc.Entity(name);
  const mis = [];
  for (const key of Object.keys(geos)) {
    const mat = mats[key];
    if (!mat) throw new Error('no material ' + key);
    const mesh = geos[key].build(device, !!mat.normalMap);
    if (!mesh) continue;
    const mi = new pc.MeshInstance(mesh, mat);
    const noShadow = mat._noShadow || (opts.noShadow && opts.noShadow.includes(key));
    mi.castShadow = !noShadow;
    mi._ownsMesh = true;
    mis.push(mi);
  }
  e.addComponent('render', { meshInstances: mis, castShadows: true, receiveShadows: true });
  // per-instance shadow flags survive the component default
  for (const mi of mis) if (mi.material._noShadow) mi.castShadow = false;
  return e;
}

/** Chunk meshes are owned by their mesh instances: destroying the entity frees them. */
export function destroyEntityMeshes(e) {
  if (e) e.destroy();
}

export function canvasTexture(device, canvas, opts = {}) {
  const tex = new pc.Texture(device, {
    width: canvas.width, height: canvas.height,
    format: opts.linear ? pc.PIXELFORMAT_RGBA8 : pc.PIXELFORMAT_SRGBA8,
    mipmaps: opts.mipmaps !== false,
    addressU: opts.clamp ? pc.ADDRESS_CLAMP_TO_EDGE : pc.ADDRESS_REPEAT,
    addressV: opts.clamp || opts.clampV ? pc.ADDRESS_CLAMP_TO_EDGE : pc.ADDRESS_REPEAT,
    minFilter: opts.mipmaps === false ? pc.FILTER_LINEAR : pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    anisotropy: opts.aniso || 4,
  });
  tex.setSource(canvas);
  return tex;
}

/**
 * Standard material shorthand.
 * o: { map, color, vc, gloss, metal, emissive, emissiveMap, emissiveVc, emissiveIntensity, alphaTest, twoSided,
 *      blend:'add'|'alpha', opacity, noFog, unlit, noShadow, depthWrite }
 */
/** Every material made by mat(), so the boot screen can compile their shaders before the first run. */
export const MATERIALS = [];
export function mat(o = {}) {
  const m = new pc.StandardMaterial();
  MATERIALS.push(m);
  const c = o.color || [1, 1, 1];
  m.diffuse.set(c[0], c[1], c[2]);
  if (o.map) m.diffuseMap = o.map;
  if (o.vc) m.diffuseVertexColor = true;
  m.useMetalness = true;
  m.metalness = o.metal || 0;
  m.gloss = o.gloss ?? 0.15;
  if (o.emissive) m.emissive.set(o.emissive[0], o.emissive[1], o.emissive[2]);
  if (o.emissiveMap) m.emissiveMap = o.emissiveMap;
  if (o.emissiveVc) m.emissiveVertexColor = true;
  if (o.emissiveIntensity != null) m.emissiveIntensity = o.emissiveIntensity;
  if (o.alphaTest) { m.opacityMap = o.map; m.opacityMapChannel = 'a'; m.alphaTest = o.alphaTest; }
  if (o.twoSided) { m.cull = pc.CULLFACE_NONE; m.twoSidedLighting = true; }
  if (o.blend === 'add') { m.blendType = pc.BLEND_ADDITIVEALPHA; m.depthWrite = false; if (o.map) { m.opacityMap = o.map; m.opacityMapChannel = 'a'; } }
  if (o.blend === 'alpha') { m.blendType = pc.BLEND_NORMAL; m.depthWrite = o.depthWrite ?? false; if (o.map && o.alphaMap !== false) { m.opacityMap = o.map; m.opacityMapChannel = 'a'; } }
  if (o.opacity != null) m.opacity = o.opacity;
  if (o.opacityVc) m.opacityVertexColor = true;
  if (o.noFog) m.useFog = false;
  if (o.unlit) { m.useLighting = false; m.ambient?.set?.(0, 0, 0); }
  if (o.normalMap) { m.normalMap = o.normalMap; m.bumpiness = o.bump ?? 1; }
  // env: reflect the sky / forest environment atlas (and take ambient from it)
  m.useSkybox = !!o.env;
  if (o.spec != null) { m.specular.set(o.spec, o.spec, o.spec); m.specularityFactor = 1; }
  m._noShadow = !!(o.noShadow || o.blend || o.unlit);
  m.update();
  return m;
}

/**
 * Draw one tiny mesh with every material for a few frames. A GPU pipeline is compiled the first time a material
 * is drawn, which stalls the frame for 100-300 ms; doing it behind the loading screen keeps that out of the run.
 */
export async function warmShaders(app, device, parent, frames = 3) {
  const e = new pc.Entity('warm'), g = new Geo();
  g.box(0, 0, 0, 0.01, 0.01, 0.01, [1, 1, 1]);
  const plain = g.build(device, false), tangent = g.build(device, true);
  const mis = MATERIALS.map((m) => { const mi = new pc.MeshInstance(m.normalMap ? tangent : plain, m); mi.castShadow = !m._noShadow; return mi; });
  e.addComponent('render', { meshInstances: mis, castShadows: true, receiveShadows: true });
  for (const mi of mis) if (mi.material._noShadow) mi.castShadow = false;
  parent.addChild(e); e.setLocalPosition(0, 0, -3);
  const guard = new Promise((r) => setTimeout(r, 2500)); // a hidden tab draws no frames: never hold the boot for it
  for (let i = 0; i < frames; i++) await Promise.race([new Promise((r) => app.once('frameend', r)), guard]);
  e.destroy(); plain.destroy(); tangent.destroy();
}
