// Tumbling maple leaves: an ambient fall around the camera plus short-lived bursts (pickups, crashes, the runner's wake).
import * as pc from 'playcanvas';
import { rnd, hex, mat } from './gfx.js';

const PALETTE = ['#c22a1c', '#dc4420', '#ea7a22', '#f0a630', '#f2c53c', '#9a1f24', '#e8542a', '#f7cf5a'].map(hex);
const GOLD = ['#ffd24a', '#fff0a0', '#f8b830'].map(hex);

export class Leaves {
  constructor(stage, opts = {}) {
    const N = (this.N = opts.ambient ?? 260), B = (this.B = 150);
    const T = N + B;
    this.stage = stage;
    this.r = rnd(99);
    this.pos = new Float32Array(T * 12);
    const uv = new Float32Array(T * 8), col = new Uint8Array(T * 16), nrm = new Float32Array(T * 12);
    const idx = new Uint16Array(T * 6);
    this.col = col;
    this.p = [];
    const r = this.r;
    for (let i = 0; i < T; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      for (let k = 0; k < 4; k++) nrm.set([0, 1, 0], i * 12 + k * 3);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      const o = { x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, a: r() * 6.3, b: r() * 6.3, wa: r.range(1.5, 5) * r.sign(), wb: r.range(1, 4), s: r.range(0.16, 0.3), life: 0, sway: r() * 6.3, burst: i >= N };
      this.p.push(o);
      this._tint(i, r.pick(PALETTE));
      if (i < N) this._respawn(o, true);
    }
    const mesh = (this.mesh = new pc.Mesh(stage.device));
    mesh.clear(true, false);
    mesh.setPositions(this.pos); mesh.setNormals(nrm); mesh.setUvs(0, uv); mesh.setColors32(col); mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const m = mat({ map: stage.tx.leaf1, vc: true, alphaTest: 0.4, twoSided: true, emissiveVc: true, emissiveMap: stage.tx.leaf1, emissive: [1, 1, 1], emissiveIntensity: 0.5, noShadow: true });
    const mi = new pc.MeshInstance(mesh, m);
    mi.cull = false; mi.castShadow = false;
    const e = (this.entity = new pc.Entity('leaves'));
    e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false });
    stage.scene.contentRoot.addChild(e);
    this.next = 0;
    this.colDirty = false;
  }

  _tint(i, c, k = 1) {
    for (let v = 0; v < 4; v++) {
      const o = i * 16 + v * 4;
      this.col[o] = Math.pow(c[0] * k, 2.2) * 255; this.col[o + 1] = Math.pow(c[1] * k, 2.2) * 255; this.col[o + 2] = Math.pow(c[2] * k, 2.2) * 255; this.col[o + 3] = 255;
    }
  }

  _respawn(o, anywhere) {
    const r = this.r;
    o.x = r.range(-15, 15);
    o.y = anywhere ? r.range(0.2, 12) : r.range(7, 12.5);
    o.z = anywhere ? r.range(-70, 8) : r.range(-70, -6);
    o.vy = -r.range(0.5, 1.3);
    o.vx = r.range(-0.3, 0.6); o.vz = 0;
  }

  /** Burst of n leaves at a world position. gold = pickup sparkle. */
  burst(x, y, z, n = 10, opts = {}) {
    const r = this.r;
    for (let i = 0; i < n; i++) {
      const j = this.N + (this.next++ % this.B);
      const o = this.p[j];
      o.x = x + r.range(-0.3, 0.3); o.y = y + r.range(-0.2, 0.4); o.z = z + r.range(-0.3, 0.3);
      const sp = opts.speed || 4;
      o.vx = r.range(-1, 1) * sp; o.vy = r.range(0.3, 1.2) * sp; o.vz = r.range(-1, 1) * sp + (opts.vz || 0);
      o.life = r.range(0.7, 1.4) * (opts.life || 1);
      o.s = r.range(0.14, 0.26) * (opts.size || 1);
      this._tint(j, r.pick(opts.gold ? GOLD : PALETTE));
    }
    this.colDirty = true;
  }

  update(dt, scroll, time, wind = 0) {
    const P = this.pos;
    const cam = this.stage.cam.getPosition();
    for (let i = 0; i < this.p.length; i++) {
      const o = this.p[i];
      if (o.burst) {
        if (o.life <= 0) { if (o.y > -50) { o.y = -100; for (let k = 0; k < 12; k++) P[i * 12 + k] = k % 3 === 1 ? -100 : 0; } continue; }
        o.life -= dt;
        o.vy -= 9 * dt; o.vx *= 1 - 1.5 * dt; o.vz *= 1 - 1.5 * dt;
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += (o.vz + scroll) * dt;
        if (o.y < 0.05) { o.y = 0.05; o.vy = 0; o.vx *= 0.5; }
      } else {
        o.x += (o.vx + Math.sin(time * 1.3 + o.sway) * 0.9 + wind) * dt;
        o.y += o.vy * dt;
        o.z += scroll * dt;
        if (o.y < 0.02 || o.z > cam.z + 3 || Math.abs(o.x) > 17) this._respawn(o, false);
      }
      o.a += o.wa * dt; o.b += o.wb * dt;
      // quad spanned by two tumbling axes
      const ca = Math.cos(o.a), sa = Math.sin(o.a), cb = Math.cos(o.b), sb = Math.sin(o.b), s = o.s;
      const rx = ca * s, ry = sa * sb * s, rz = sa * cb * s;
      const ux = -sa * s, uy = ca * sb * s, uz = ca * cb * s;
      const q = i * 12;
      P[q] = o.x - rx - ux; P[q + 1] = o.y - ry - uy; P[q + 2] = o.z - rz - uz;
      P[q + 3] = o.x + rx - ux; P[q + 4] = o.y + ry - uy; P[q + 5] = o.z + rz - uz;
      P[q + 6] = o.x + rx + ux; P[q + 7] = o.y + ry + uy; P[q + 8] = o.z + rz + uz;
      P[q + 9] = o.x - rx + ux; P[q + 10] = o.y - ry + uy; P[q + 11] = o.z - rz + uz;
    }
    this.mesh.setPositions(P);
    if (this.colDirty) { this.mesh.setColors32(this.col); this.colDirty = false; }
    this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }
}

/** Soft contact shadow under a character. */
export function blobShadow(stage) {
  const e = new pc.Entity('blob');
  e.addComponent('render', { type: 'plane', material: stage.mats.shadow, castShadows: false, receiveShadows: false });
  e.setLocalScale(1.5, 1, 1.5);
  stage.scene.contentRoot.addChild(e);
  return e;
}
