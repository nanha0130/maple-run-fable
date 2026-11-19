// Everything on the rails: pattern generator, trains, hurdles, gates, ramps, leaves, power-ups.
import { rnd, clamp, lerp } from './gfx.js';
import { LANES, TRAIN_TOP } from './world.js';

export const CAR = 15;
const DETAIL_AHEAD = 150; // metres: beyond this a car is drawn as its painted shell only
export const HOVER_Y = 5.5;
export const POWERS = ['wind', 'magnet', 'x2', 'shield'];
export const speedAt = (dist) => 13.5 + Math.min(13.5, dist * 0.0042);

export class Course {
  constructor(stage, props) {
    this.stage = stage; this.props = props;
    this.items = []; // hurdles + gates
    this.trains = []; this.ramps = []; this.leaves = []; this.powers = [];
    this.leafPool = [];
    this.reset(1);
  }

  reset(seed) {
    for (const list of [this.items, this.ramps, this.powers]) { for (const o of list) o.ent && o.ent.destroy(); list.length = 0; }
    for (const t of this.trains) for (const e of t.ents) e.destroy();
    this.trains.length = 0;
    for (const l of this.leaves) this._freeLeaf(l);
    this.leaves.length = 0;
    this.r = rnd(seed);
    this.cur = 46; this.block = 0; this.lastKind = ''; this.lastPower = -80; this.nextPower = 240;
    this.powerBag = [];
  }

  // ---------- spawning ----------
  _add(ent, s, x = 0, y = 0) { this.stage.worldRoot.addChild(ent); ent.setLocalPosition(x, y, -s); return ent; }

  hurdle(lane, s) { this.items.push({ type: 'hurdle', lane, s, ent: this._add(this.props.hurdle(), s, LANES[lane]) }); }
  gate(lane, s) { this.items.push({ type: 'gate', lane, s, ent: this._add(this.props.gate(), s, LANES[lane]) }); }

  train(lane, s, cars, moving = false) {
    const t = { lane, s, len: cars * CAR, speed: 0, moving, active: false, ents: [], horn: false };
    for (let i = 0; i < cars; i++) {
      const e = this.props.car(moving ? 'green' : 'maroon', moving && i === 0);
      this._add(e, s + i * CAR, LANES[lane]);
      if (moving && i === 0) { const f = this.props.flare(); e.addChild(f); f.setLocalPosition(0, 0, 0.5); t.flare = f; }
      t.ents.push(e);
    }
    this.trains.push(t);
    return t;
  }

  ramp(lane, s) { this.ramps.push({ lane, s, len: this.props.RAMP_LEN, ent: this._add(this.props.ramp(), s, LANES[lane]) }); }

  _freeLeaf(l) { if (l.ent) { l.ent.enabled = false; this.leafPool.push(l.ent); l.ent = null; } }
  leaf(lane, s, y = 1.05) {
    const ent = this.leafPool.pop() || this._add(this.props.leaf(), s);
    ent.enabled = true;
    ent.setLocalPosition(LANES[lane], y, -s);
    this.leaves.push({ lane, s, x: LANES[lane], y, ent, ph: s * 0.9, pull: 0 });
  }
  leafLine(lane, s, n, yFn = null, step = 2.3) { for (let i = 0; i < n; i++) this.leaf(lane, s + i * step, yFn ? yFn(i / Math.max(1, n - 1), s + i * step) : 1.05); }
  leafArc(lane, s, speed) { // over a hurdle at s, following the jump arc
    const half = speed * 0.33;
    for (let i = 0; i < 5; i++) { const t = i / 4; this.leaf(lane, s - half + t * 2 * half, 1.05 + 1.75 * Math.sin(t * Math.PI)); }
  }

  power(lane, s, kind, y = 1.3) {
    const ent = this._add(this.props.power(kind), s, LANES[lane], y);
    this.powers.push({ kind, lane, s, y, ent });
  }

  // ---------- generator ----------
  _row(s, lanes, d, sp, leafLanes = true) {
    const r = this.r;
    const free = lanes.slice();
    const p = r();
    let n = p < lerp(0.5, 0.22, d) ? 1 : p < lerp(0.85, 0.62, d) ? 2 : 3;
    n = Math.min(n, free.length);
    const picks = [];
    while (picks.length < n) { const l = free.splice(r.int(0, free.length - 1), 1)[0]; picks.push(l); }
    for (const l of picks) {
      if (r.chance(0.42)) this.gate(l, s);
      else { this.hurdle(l, s); if (leafLanes && r.chance(0.45)) this.leafArc(l, s, sp); }
    }
    if (leafLanes && free.length && r.chance(0.7)) this.leafLine(r.pick(free), s - 5, 5);
  }

  _gen(runnerS) {
    const r = this.r, s0 = this.cur;
    const sp = speedAt(s0), d = clamp(s0 / 3200, 0, 1);
    const gap = Math.max(12.5, sp * 0.86);
    this.block++;
    const due = s0 - this.lastPower > this.nextPower;
    let kind;
    if (this.block <= 1) kind = 'breather';
    else if (due) kind = 'breather';
    else {
      const w = [['singles', 3], ['trains', s0 > 110 ? 3.2 : 0], ['oncoming', d > 0.1 && this.lastKind !== 'oncoming' ? 1.7 : 0],
        ['roofrun', d > 0.16 && this.lastKind !== 'roofrun' ? 1.3 : 0], ['breather', this.lastKind === 'breather' ? 0 : 0.8]];
      let tot = 0; for (const [, v] of w) tot += v;
      let x = r() * tot;
      for (const [k, v] of w) { x -= v; if (x <= 0) { kind = k; break; } }
      kind = kind || 'singles';
    }
    this.lastKind = kind;
    let len = 30;
    const all = [0, 1, 2];

    if (kind === 'breather') {
      len = 34;
      let lane = r.int(0, 2);
      for (let i = 0; i < 3; i++) {
        this.leafLine(lane, s0 + 2 + i * 11, 4);
        lane = clamp(lane + r.sign(), 0, 2);
      }
      if (due) {
        if (!this.powerBag.length) this.powerBag = POWERS.slice().sort(() => r() - 0.5);
        this.power(lane, s0 + 37, this.powerBag.pop());
        this.lastPower = s0; this.nextPower = r.range(300, 460);
        len = 44;
      }
    } else if (kind === 'singles') {
      const rows = r.int(2, 4);
      for (let i = 0; i < rows; i++) this._row(s0 + i * gap, all, d, sp);
      len = rows * gap;
    } else if (kind === 'trains') {
      const nl = d < 0.12 ? 1 : r.pick([1, 2, 2]);
      const lanes = all.slice().sort(() => r() - 0.5).slice(0, nl);
      const free = all.filter((l) => !lanes.includes(l));
      const start = s0 + 9;
      let maxEnd = start;
      let ramped = false;
      for (const l of lanes) {
        const cars = r.int(1, d < 0.25 ? 2 : 3);
        const off = r.chance(0.5) ? 0 : r.range(4, 10);
        const ts = start + off;
        this.train(l, ts, cars);
        if (!ramped && r.chance(0.5)) {
          ramped = true;
          this.ramp(l, ts - this.props.RAMP_LEN);
          this.leafLine(l, ts - this.props.RAMP_LEN, 3, (t) => 1.05 + TRAIN_TOP * t, this.props.RAMP_LEN / 2.4);
          this.leafLine(l, ts + 3, Math.floor((cars * CAR - 5) / 2.6), () => TRAIN_TOP + 1.05, 2.6);
        }
        maxEnd = Math.max(maxEnd, ts + cars * CAR);
      }
      for (let s = start + gap * 0.6; s < maxEnd - 5; s += gap) this._row(s, free, d, sp);
      if (free.length && r.chance(0.6)) this.leafLine(r.pick(free), start - 2, 4);
      len = maxEnd - s0 + 6;
    } else if (kind === 'oncoming') {
      const lane = r.int(0, 2);
      const free = all.filter((l) => l !== lane);
      const spawn = s0 + 58;
      this.train(lane, spawn, 2, true);
      for (let s = s0 + gap; s < spawn - 4; s += gap) this._row(s, free, Math.min(d, 0.4), sp);
      len = 58 + 2 * CAR + 6; // the parked-until-activated train must not sit in the next block
    } else if (kind === 'roofrun') {
      const cars = r.int(2, 3);
      const wall = r.int(0, 2);
      const start = s0 + 10;
      for (const l of all) {
        this.train(l, start, cars);
        if (l !== wall) {
          this.ramp(l, start - this.props.RAMP_LEN);
          this.leafLine(l, start - this.props.RAMP_LEN - 6, 3);
          this.leafLine(l, start - this.props.RAMP_LEN, 3, (t) => 1.05 + TRAIN_TOP * t, this.props.RAMP_LEN / 2.4);
        }
      }
      let lane = wall === 1 ? 0 : 1;
      for (let s = start + 4; s < start + cars * CAR - 4; s += 9) {
        this.leafLine(lane, s, 3, () => TRAIN_TOP + 1.05, 2.6);
        lane = clamp(lane + r.sign(), 0, 2);
      }
      len = 10 + cars * CAR + 8;
    }
    this.cur = s0 + len + gap * (kind === 'breather' ? 0.45 : 1);
    void runnerS;
  }

  /** Fill the sky lane with leaves for a wind ride. */
  airLeaves(from, to) {
    const r = this.r;
    let lane = r.int(0, 2);
    for (let s = from; s < to; s += 13) { this.leafLine(lane, s, 4, () => HOVER_Y + 1.05, 2.6); lane = clamp(lane + r.sign(), 0, 2); }
  }

  // ---------- queries ----------
  /** Height of the walkable surface in `lane` at distance s. */
  surface(lane, s) { return Math.max(this.trainH(lane, s), this.rampH(lane, s)); }
  /** Trains are walls from the side and the front; ramps are slopes you are lifted onto. */
  trainH(lane, s) {
    for (const t of this.trains) if (t.lane === lane && s >= t.s - 0.25 && s <= t.s + t.len + 0.25) return TRAIN_TOP;
    return 0;
  }
  rampH(lane, s) {
    let h = 0;
    for (const p of this.ramps) if (p.lane === lane && s >= p.s && s <= p.s + p.len + 0.3) h = Math.max(h, TRAIN_TOP * clamp((s - p.s) / p.len, 0, 1));
    return h;
  }

  /** Next thing in a lane within `range` metres: { type, dist, ref }. For the autopilot. */
  ahead(lane, s, range) {
    let best = null;
    const consider = (type, at, ref) => { const d = at - s; if (d > -0.5 && d < range && (!best || d < best.dist)) best = { type, dist: d, ref }; };
    for (const o of this.items) if (o.lane === lane && !o.gone) consider(o.type, o.s, o);
    for (const t of this.trains) if (t.lane === lane) {
      if (s >= t.s && s <= t.s + t.len) consider('train', s, t); else consider('train', t.s, t);
    }
    for (const p of this.ramps) if (p.lane === lane) consider('ramp', p.s, p);
    return best;
  }

  // ---------- per-frame ----------
  update(runnerS, dt, time, onHorn) {
    while (this.cur < runnerS + 300) this._gen(runnerS);
    const sp = speedAt(runnerS);
    for (const t of this.trains) {
      if (t.moving) {
        if (!t.active && t.s - runnerS < 105) { t.active = true; t.speed = 11.5; }
        if (t.active) {
          t.s -= t.speed * dt;
          for (let i = 0; i < t.ents.length; i++) { const p = t.ents[i].getLocalPosition(); t.ents[i].setLocalPosition(p.x, p.y, -(t.s + i * CAR)); }
          if (!t.horn && t.s - runnerS < Math.max(60, sp * 2.6)) { t.horn = true; onHorn && onHorn(t); }
        }
        if (t.flare) { const k = 0.8 + 0.2 * Math.sin(time * 40); t.flare.setLocalScale(k, k, 1); }
      }
      // trim, bogies and roof gear only on the cars near the runner (see props.car)
      for (let i = 0; i < t.ents.length; i++) {
        const near = t.s + i * CAR - runnerS < DETAIL_AHEAD, e = t.ents[i];
        if (e.near !== near) { e.near = near; for (const mi of e.detail) mi.visible = near; }
      }
    }
    // despawn behind
    const cut = runnerS - 22;
    const drop = (list, end) => { for (let i = list.length - 1; i >= 0; i--) { const o = list[i]; if (end(o) < cut) { if (o.ent) o.ent.destroy(); if (o.ents) for (const e of o.ents) e.destroy(); list.splice(i, 1); } } };
    drop(this.items, (o) => o.s); drop(this.ramps, (o) => o.s + o.len); drop(this.powers, (o) => o.s);
    drop(this.trains, (o) => o.s + o.len);
    for (let i = this.leaves.length - 1; i >= 0; i--) { const l = this.leaves[i]; if (l.s < cut || l.taken) { this._freeLeaf(l); this.leaves.splice(i, 1); } }
    // spin
    for (const l of this.leaves) {
      if (l.s - runnerS > 130) continue;
      l.ent.setLocalEulerAngles(0, (time * 150 + l.ph * 40) % 360, 12);
      l.ent.setLocalPosition(l.x, l.y + Math.sin(time * 3 + l.ph) * 0.07, -l.s);
    }
    for (const p of this.powers) {
      const k = p.kind === 'wind' ? [0, 0, time * 300] : [0, time * 110, 0];
      p.ent.setLocalEulerAngles(k[0], k[1], k[2]);
      p.ent.setLocalPosition(LANES[p.lane], p.y + Math.sin(time * 2.6) * 0.14, -p.s);
    }
  }
}
