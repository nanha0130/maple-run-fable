// PINOC Gaussian-splat characters and the motion clips that drive them.
import * as pc from 'playcanvas';
import { Character, Animation } from '@viggle/splat-engine';

export const ROSTER = [
  { id: 'beat', name: 'BEAT', jp: 'ビート', tag: 'Streetwear sprinter', portrait: './portraits/beat.jpg' },
  { id: 'wukong', name: 'WUKONG', jp: '悟空', tag: 'Monkey King', portrait: './portraits/wukong.jpg' },
  { id: 'muse', name: 'MUSE', jp: 'ミューズ', tag: 'Tomboy on the run', portrait: './portraits/muse.jpg' },
];

// Motion set and timings follow the original maple-run: library clips for idle / roll / landings, PINOC
// text-to-motion clips (gen_*) for the sprint, leap, dodges, hover and the crash reactions.
// `at` = seconds into the clip where the action starts.
export const RUN_CLIP = 'gen_sprint_1';
export const CLIP = {
  jump: { name: 'gen_leap_3', at: 0.62, air: 0.5 },
  hover: { name: 'gen_hover_2' },
  dodgeL: { name: 'gen_dodgeL_1', at: 0.4 }, dodgeR: { name: 'gen_dodgeR_1', at: 0.4 },
  wall: { name: 'gen_wall_1', at: 1.12 }, trip: { name: 'gen_trip_3', at: 0.85 },
  bar: { name: 'head_hit', at: 0 }, caught: { name: 'gen_caught_3', at: 0.3 },
};
const LIBRARY = ['running', 'run_jump', 'roll', 'hard_landing', 'knocked_down', 'fall_down', 'standing_idle', 'cheering', 'point_forward', 'head_hit', 'hit_front'];
const GENERATED = ['gen_sprint_1', 'gen_leap_3', 'gen_hover_2', 'gen_dodgeL_1', 'gen_dodgeR_1', 'gen_wall_1', 'gen_trip_3', 'gen_caught_3'];
const CORE = ['standing_idle', 'running', RUN_CLIP];

// Library clips face -Z; text-to-motion clips face +Z. Turn root + pelvis of the generated ones once at load,
// so every clip shares one facing and crossfades between the two families stay clean.
const TURN = new pc.Mat4().setFromEulerAngles(0, 180, 0);
function prepare(animation, generated) {
  if (!generated) return animation;
  const m = new pc.Mat4();
  for (let f = 0; f < animation.numFrames; f++) for (const bone of [0, 1]) {
    const o = (f * animation.numBones + bone) * 16;
    m.data.set(animation.data.subarray(o, o + 16)); m.mul2(TURN, m); animation.data.set(m.data, o);
  }
  return animation;
}

export class Cast {
  constructor(scene) {
    this.scene = scene;
    this.loaded = new Map();
    this.clipReady = new Set();
    this.clipLoading = new Map();
  }

  _clip(name) {
    if (this.clipLoading.has(name)) return this.clipLoading.get(name);
    const p = fetch(`./motions/${name}.glb`).then((r) => { if (!r.ok) throw new Error('clip ' + name); return r.arrayBuffer(); })
      .then((buf) => { prepare(Animation.fromGlb(buf), name.startsWith('gen_')).register(this.scene, name); this.clipReady.add(name); });
    this.clipLoading.set(name, p);
    p.catch(() => this.clipLoading.delete(name));
    return p;
  }
  loadCoreClips() { return Promise.all(CORE.map((k) => this._clip(k))); }
  loadAllClips() { return Promise.all([...LIBRARY, ...GENERATED].map((k) => this._clip(k))); }

  /** Swap in the player's own character ('mine'): a .vsplat Blob, or null to remove it. */
  setCustom(blob) {
    const old = this.loaded.get('mine'); this.loaded.delete('mine');
    old?.then((a) => { a.show(false); a.ch.destroy?.(); }).catch(() => {});
    if (this.customUrl) URL.revokeObjectURL(this.customUrl);
    this.customUrl = blob ? URL.createObjectURL(blob) : null;
  }

  async actor(id) {
    if (this.loaded.has(id)) return this.loaded.get(id);
    if (id === 'mine' && !this.customUrl) throw new Error('no custom runner');
    const p = Character.load(this.scene, id === 'mine' ? this.customUrl : `./characters/${id}.vsplat`, { name: id }).then((ch) => new Actor(ch, this));
    this.loaded.set(id, p);
    p.catch(() => this.loaded.delete(id)); // a failed download can be retried
    return p;
  }
}

export class Actor {
  constructor(ch, cast) {
    this.ch = ch; this.cast = cast;
    this.anim = null;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.roll = 0; this.pitch = 0;
    // every clip plays in place: the game owns forward motion
    ch.armature.rootMotionMode = 'extract';
  }

  show(on) { this.ch.setActive(on); }

  play(name, { loop = true, fade = 0.15, speed = 1, restart = false, at = null } = {}) {
    if (!this.cast.clipReady.has(name)) name = this.cast.clipReady.has(RUN_CLIP) ? RUN_CLIP : 'standing_idle';
    if (this.anim === name && loop && !restart) { this.ch.playbackSpeed = speed; return; }
    this.anim = name;
    if (fade > 0 && this.ch.currentAnimationName) this.ch.crossfadeTo(name, { duration: fade, loop, rootMotion: false });
    else this.ch.playAnimation(name, { loop, rootMotion: false });
    this.ch.armature.rootMotionMode = 'extract';
    this.ch.playbackSpeed = speed;
    if (at != null) this.ch.armature.animationTime = at * (this.ch.armature.frameRate || 30); // engine time is in frames
  }

  /** Keep the pelvis at clip height (jumps and hovers move the body themselves). */
  set lockY(v) { this.ch.armature.lockPelvisY = v; }

  update() {
    this.ch.armature.consumeRootMotionDelta?.();
    this.ch.setPosition(this.x, this.y, this.z);
    this.ch.setRotation(this.pitch, this.yaw, this.roll);
  }

  tint(k, r = 1, g = 1, b = 1) { this.ch.setTint(k, { r, g, b }); }
}
