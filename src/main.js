// MAPLE RUN (Fable 5.2 edition): boot, runner physics and collision, station master, cameras, input, autopilot.
import { createStage } from './stage.js';
import { createProps } from './props.js';
import { Course, speedAt, HOVER_Y } from './course.js';
import { Cast, ROSTER, RUN_CLIP, CLIP } from './actors.js';
import { loadRunner } from './pinoc.js';
import { Leaves, blobShadow } from './fx.js';
import { Sound } from './audio.js';
import { createUI } from './ui.js';
import { LANES, TRAIN_TOP, sunAt } from './world.js';
import { clamp, lerp, damp, smooth, warmShaders } from './gfx.js';

const q = new URLSearchParams(location.search);
const DEBUG = q.has('debug'), AUTO = q.has('auto');
const canvas = document.getElementById('game');
const snd = new Sound();
snd.silent = DEBUG && !q.has('sound');
let state = 'boot'; // boot | title | run | dead | over
let paused = false, starting = false;
let sunlit = 0.15; // how much sun the characters are lit with, 0..1 (follows the stretch of line)
let mineBlob = null, queuedRunner; // the player's own runner (.vsplat Blob), and one that arrived mid-run

const ui = createUI(document.getElementById('ui'), {
  onSelect: (id) => select(id), onStart: () => start(), onRetry: () => start(), onMenu: () => toTitle(),
  onPause: () => togglePause(), onMute: () => ui.mute(snd.toggleMute()),
  onRunner: (blob) => setRunner(blob), canMake: () => state === 'title',
});
ui.mute(snd.muted);

const GRAV = 30, JUMP_V = 10.6, ROLL_T = 0.78, STEP = 0.75, PLATFORM_Y = 1.12;
const mobile = matchMedia('(pointer:coarse)').matches && Math.min(innerWidth, innerHeight) < 820;
let stage, props, course, cast, fx, hero = null, chaser = null, heroId = localStorage.getItem('maple.hero') || 'beat';
if (heroId !== 'mine' && !ROSTER.some((c) => c.id === heroId)) heroId = 'beat';
let best = +localStorage.getItem('maple.best') || 0;
let time = 0, shake = 0, runSeed = +q.get('seed') || 0;
let heroShadow, chaserShadow;

const R = {};
const C = { gap: 3, x: 6.2, y: PLATFORM_Y, target: 9, mode: 'wait', t: 0 };
const cam = { x: 2.3, y: 1.55, z: -5.2, lx: 0.2, ly: 1.2, lz: 0, fov: 50, y0: 0, intro: 1 };

function resetRunner() {
  Object.assign(R, {
    s: 0, x: 0, lane: 1, y: 0, vy: 0, grounded: true, roll: 0, wantRoll: false, speed: 0, jumpBuf: 0, coyote: 0, bump: 0, lean: 0,
    chase: 0, dodgeT: 0, inv: 0, ghost: false, hover: 0, magnet: 0, x2: 0, shield: false,
    score: 0, leaves: 0, mult: 1, dead: null, deadT: 0, recoil: 0, t: 0, landT: 0,
  });
}
resetRunner();

// ------------------------------------------------------------------ boot
try {
  ui.boot('Laying the track…');
  performance.mark('b0');
  stage = await createStage(canvas, { backend: q.get('backend') || undefined, nopost: q.has('nopost'), lowfx: mobile || q.has('lowfx'), dpr: +q.get('dpr') || 1.5 });
  performance.mark('b1');
  props = await createProps(stage.device, stage.mats, stage.tx);
  stage.mats.blink = props.blink;
  performance.mark('b2');
  course = new Course(stage, props);
  fx = new Leaves(stage, { ambient: mobile ? 140 : 260 });
  heroShadow = blobShadow(stage); chaserShadow = blobShadow(stage);
  stage.update(0, 99);
  performance.mark('b3');
  ui.boot('Waking the runners…');
  cast = new Cast(stage.scene);
  await cast.loadCoreClips();
  cast.loadMoveClips().catch(() => {}); // next in line, ahead of the crash reactions
  performance.mark('b4');
  const mine = await loadRunner(); // the player's own PINOC character, kept in this browser
  if (mine?.vsplat) { mineBlob = mine.vsplat; cast.setCustom(mine.vsplat); ui.mine(mine.photo); } else if (heroId === 'mine') heroId = 'beat';
  [chaser] = await Promise.all([cast.actor('conductor'), select(heroId, true)]);
  await warmShaders(stage.app, stage.device, stage.cam);
  performance.mark('b5');
  chaser.play('standing_idle', { fade: 0 });
  cast.loadAllClips();
  stage.app.on('update', frame);
  // Draw at most 60 times a second (a 120 Hz screen would double the GPU work for no gain), 15 while paused,
  // and shed resolution when the GPU cannot keep up. This is what keeps laptops and phones cool.
  if (!DEBUG || q.has('cap')) {
    const dev = stage.app.graphicsDevice; let lastDraw = 0, slow = 0, ticks = 0, tickT = performance.now(), fast = false, ninety = 0;
    stage.app.autoRender = false;
    stage.app.on('update', (dt) => {
      const now = performance.now();
      // A 12 ms gate between draws: a 60 Hz screen passes every frame, a 120 Hz one every second frame (a steady 60).
      // It must stay below 16 ms: when the GPU is behind, callbacks on a 120 Hz screen arrive ~16 ms after a draw and a
      // 15.5 ms gate missed half of them, which showed as 16/24 ms judder. Drawing every callback there is no better:
      // it saturates the GPU and the pacing goes uneven. Only a 90 Hz screen (11 ms) is let through ungated, and only
      // if the screen never showed 100+ callbacks a second, so a loaded 120 Hz screen is not mistaken for one.
      if (++ticks, now - tickT >= 1000) {
        const rate = ticks * 1000 / (now - tickT);
        if (rate >= 100) fast = true;
        ninety = !document.hidden && rate > 84 && rate < 96 ? ninety + 1 : 0;
        ticks = 0; tickT = now;
      }
      const gap = paused ? 66 : !fast && ninety >= 3 ? 0 : 12;
      if (now - lastDraw >= gap) { stage.app.renderNextFrame = true; lastDraw = now; }
      if (paused || document.hidden || state !== 'run' || R.s < 150) { slow = 0; return; } // judge only steady running, never loading hitches
      slow = dt > 1 / 33 ? slow + dt : Math.max(0, slow - dt * 0.5);
      if (slow > 3 && dev.maxPixelRatio > 1) { dev.maxPixelRatio = Math.max(1, dev.maxPixelRatio - 0.25); slow = 0; }
    });
  }
  toTitle();
  ui.ready();
  if (q.has('go') || AUTO) start();
  if (DEBUG) Object.assign(window, { G: { R, C, cam, stage, course, fx, snd, crash, start, toTitle, grant, step: (n, dt = 1 / 60) => { for (let i = 0; i < n && state === 'run'; i++) frame(dt); return { state, s: R.s | 0, dead: R.dead, y: +R.y.toFixed(2), lane: R.lane, score: R.score | 0, leaves: R.leaves }; }, get hero() { return hero; }, get state() { return state; } } });
} catch (e) {
  console.error(e);
  ui.bootError(navigator.gpu || q.get('backend') === 'webgl'
    ? 'Something went wrong while loading. ' + (e.message || e)
    : 'This browser has no WebGPU. Try desktop Chrome or Edge, or Safari 26+.');
}

// ------------------------------------------------------------------ flow
/** A new (or removed) player-made runner from the upload panel. Resolves false when the file does not load. */
async function setRunner(blob) {
  if (state !== 'title') { queuedRunner = blob; return true; } // finished in the background mid-run: swap on the title screen
  const prev = mineBlob, prevId = heroId;
  if (heroId === 'mine') { hero?.show(false); hero = null; } // the old one is destroyed by the cast
  cast.setCustom(blob);
  if (blob) {
    try { await cast.actor('mine'); } catch (e) {
      console.error(e); cast.setCustom(prev);
      await select(prevId === 'mine' && !prev ? 'beat' : prevId, true);
      return false;
    }
  }
  mineBlob = blob;
  await select(blob ? 'mine' : 'beat', true);
  return true;
}

async function select(id, silent) {
  heroId = id;
  ui.select(id, true);
  if (!silent) snd.unlock(), snd.click();
  let a;
  try { a = await cast.actor(id); } catch (e) { console.error(e); if (heroId === id) { ui.select(id, false); if (id === 'mine') return select('beat', true); } return; }
  if (heroId !== id) { if (a !== hero) a.show(false); return; } // a later click won
  if (hero && hero !== a) hero.show(false);
  hero = a; hero.show(true);
  localStorage.setItem('maple.hero', id);
  hero.anim = null; hero.lockY = false;
  hero.play(state === 'run' ? RUN_CLIP : 'standing_idle', { fade: 0 });
  ui.select(id, false);
}

function toTitle() {
  state = 'title'; paused = false; stage.app.timeScale = 1;
  resetRunner(); sunlit = sunAt(0);
  course.reset(1);
  stage.update(0, 99);
  Object.assign(C, { gap: 5.5, x: -5.7, y: PLATFORM_Y, mode: 'wait', t: 0 });
  if (hero) { hero.lockY = false; hero.ch.stopLayer('hit', 0); hero.play('standing_idle', { fade: 0.2 }); hero.tint(0); }
  chaser.play('standing_idle', { fade: 0.2 });
  cam.intro = 1;
  snd.stopMusic(0.4);
  ui.title(best);
  ui.select(heroId, false);
  if (queuedRunner !== undefined) { const b = queuedRunner; queuedRunner = undefined; setRunner(b); }
}

async function start() {
  if ((state !== 'title' && state !== 'over') || !hero || starting) return;
  snd.unlock();
  starting = true;
  cast.loadAllClips().catch((e) => console.error(e));
  try { await cast.loadMoveClips(); } catch (e) { console.error(e); return; } finally { starting = false; }
  if (state !== 'title' && state !== 'over') return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const wasTitle = state === 'title';
  state = 'run'; paused = false; stage.app.timeScale = 1;
  resetRunner(); sunlit = sunAt(0);
  course.reset(runSeed || (Date.now() & 0xffff) + 1);
  stage.update(0, 99);
  R.speed = 5;
  Object.assign(C, { gap: wasTitle ? 5.5 : 5, x: wasTitle ? -5.7 : 0, y: wasTitle ? PLATFORM_Y : 0, mode: 'chase', t: 0, target: 3.2 });
  cam.intro = wasTitle ? 0 : 0.55;
  hero.tint(0);
  hero.lockY = false; hero.ch.stopLayer('hit', 0);
  hero.play(RUN_CLIP, { fade: 0.25, speed: 1.25 });
  chaser.play('running', { fade: 0.2, speed: 1.75 });
  snd.start(); snd.whistle(); snd.startMusic();
  ui.run();
  ui.score(0, 0, 1);
  ui.hint(ui.touch ? 'Swipe ← → to switch track · ↑ jump · ↓ roll' : '<kbd>←</kbd><kbd>→</kbd> switch track · <kbd>↑</kbd> jump · <kbd>↓</kbd> roll', 5);
}

function togglePause() {
  if (state !== 'run') return;
  paused = !paused;
  stage.app.timeScale = paused ? 0 : 1;
  ui.paused(paused);
  if (paused) snd.duck(0.12); else snd.duck(0.5);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'run' && !paused && !AUTO && !DEBUG) togglePause(); });

// ------------------------------------------------------------------ input
function move(dir) {
  if (state !== 'run' || paused) return;
  const nl = clamp(R.lane + dir, 0, 2);
  if (nl === R.lane) { R.bump = dir * 0.35; return; }
  if (R.hover <= 0 && !R.ghost && R.inv <= 0) {
    let h = 0;
    for (const o of [-0.5, 0.5, 1.5]) h = Math.max(h, course.trainH(nl, R.s + o));
    h = Math.max(h, course.rampH(nl, R.s)); // a ramp only blocks where it is already too high to step onto
    for (const t of course.trains) if (t.active && t.lane === nl && t.s - R.s > 0 && t.s - R.s < 1.5 + t.speed * 0.3) h = TRAIN_TOP;
    if (h > R.y + STEP) return stumble(dir);
  }
  R.lane = nl;
  snd.swish();
  if (R.grounded && R.roll <= 0 && R.hover <= 0) {
    const D = dir < 0 ? CLIP.dodgeL : CLIP.dodgeR;
    R.dodgeT = 0.36; hero.play(D.name, { loop: false, fade: 0.07, speed: 1.6, restart: true, at: D.at });
  }
}
function startRoll() {
  R.roll = ROLL_T; R.dodgeT = 0; hero.lockY = false; snd.roll();
  hero.play('roll', { loop: false, fade: 0.08, speed: 1.35, restart: true, at: 0.12 });
  fx.burst(R.x, R.y + 0.2, 0, 8, { speed: 2.5 });
}
const animSpeed = () => 1.1 + (R.speed - 13.5) * 0.035;
function jump() { if (state === 'run' && !paused) R.jumpBuf = 0.14; }
function roll() {
  if (state !== 'run' || paused || R.hover > 0) return;
  if (R.grounded) { if (R.roll <= 0.2) startRoll(); }
  else { R.vy = Math.min(R.vy, -26); R.wantRoll = true; }
}

addEventListener('keydown', (e) => {
  if (e.repeat || ui.modal() || e.target.closest?.('input,textarea')) return;
  const k = e.code;
  if (k === 'KeyM') { ui.mute(snd.toggleMute()); return; }
  if (state === 'title') { if (k === 'Enter' || k === 'Space') { e.preventDefault(); start(); } else if (k === 'ArrowLeft' || k === 'ArrowRight') { const i = ROSTER.findIndex((c) => c.id === heroId); select(ROSTER[(i + (k === 'ArrowLeft' ? ROSTER.length - 1 : 1)) % ROSTER.length].id); } return; }
  if (state === 'over') { if (k === 'Enter' || k === 'Space') { e.preventDefault(); start(); } else if (k === 'Escape') toTitle(); return; }
  if (k === 'KeyP' || k === 'Escape') return togglePause();
  if (k === 'ArrowLeft' || k === 'KeyA') move(-1);
  else if (k === 'ArrowRight' || k === 'KeyD') move(1);
  else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') { e.preventDefault(); jump(); }
  else if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); roll(); }
});
{ // swipes; a tap jumps
  let sx = 0, sy = 0, live = false, fired = false;
  canvas.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; live = true; fired = false; snd.unlock(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!live || fired) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    fired = true;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1); else if (dy < 0) jump(); else roll();
  });
  const end = (e) => { if (live && !fired && e.pointerType !== 'mouse') jump(); live = false; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', () => { live = false; });
}

// ------------------------------------------------------------------ game events
function stumble(dir) {
  R.bump = dir * 1.0; shake = 0.35;
  snd.bump();
  fx.burst(R.x + dir * 1.2, R.y + 1, 0, 6);
  // upper body flinches while the legs keep sprinting
  hero.ch.playLayer('hit', 'head_hit', { region: 'upperBody', crossfade: 0.08, loop: false });
  setTimeout(() => hero.ch.stopLayer('hit', 0.25), 450);
  if (R.chase > 0) {
    if (!R.shield) return crash('caught');
    R.shield = false; R.inv = 1.2; snd.shield(); ui.toast('お守り', 'Charm spent');
  }
  R.chase = 7; C.target = 2.3; C.mode = 'chase';
  snd.whistle();
  ui.toast('気をつけて！', 'The station master is closing in');
}

function hit(kind, o) {
  if (R.inv > 0 || R.ghost || R.hover > 0) return false;
  if (R.shield) {
    R.shield = false; R.inv = 1.6; shake = 0.4;
    if (o && o.ent) { o.gone = true; o.ent.enabled = false; }
    if (kind === 'train') R.ghost = true;
    fx.burst(R.x, R.y + 1, -1, 22, { speed: 6 });
    snd.shield(); ui.toast('お守り', 'Charm spent');
    return false;
  }
  crash(kind);
  return true;
}

function crash(kind) {
  if (state !== 'run') return;
  state = 'dead'; R.dead = kind; R.deadT = 0; R.recoil = kind === 'caught' ? 0 : -4.5; R.speed = 0; shake = 0.8;
  R.roll = 0; R.hover = 0;
  hero.lockY = false; hero.ch.stopLayer('hit', 0);
  const moving = kind === 'train' && course.trains.some((t) => t.active && t.lane === laneOf(R.x) && R.s + 1.2 >= t.s - 0.3 && R.s <= t.s + t.len);
  const D = kind === 'caught' ? CLIP.caught : kind === 'hurdle' ? CLIP.trip : kind === 'gate' ? CLIP.bar : moving ? null : CLIP.wall;
  if (D && D !== CLIP.bar) hero.play(D.name, { loop: false, fade: 0.08, restart: true, at: D.at });
  else hero.play(D ? D.name : 'knocked_down', { loop: false, fade: 0.1, speed: 1.1, restart: true, at: 0 });
  C.mode = 'catch'; C.target = kind === 'caught' ? 1.0 : 2.0;
  if (kind !== 'caught') { snd.crash(); fx.burst(R.x, R.y + 1, -0.6, 30, { speed: 7 }); } else snd.whistle();
  snd.stopMusic(0.25); snd.over();
}

function finish() {
  state = 'over';
  const score = Math.floor(R.score), record = score > best;
  if (record) { best = score; localStorage.setItem('maple.best', best); snd.record(); }
  ui.over({ score, dist: R.s, leaves: R.leaves, best, record, caught: R.dead === 'caught', cause: R.dead });
}

function grant(kind) {
  snd.power();
  if (kind === 'wind') {
    R.hover = 7; R.roll = 0; R.grounded = false; R.vy = 0;
    course.airLeaves(R.s + 16, R.s + R.speed * 1.25 * 7 - 12);
    hero.lockY = true; hero.play(CLIP.hover.name, { fade: 0.3 });
    ui.toast('風', 'Wind ride');
  } else if (kind === 'magnet') { R.magnet = 10; ui.toast('寄', 'Leaf magnet'); }
  else if (kind === 'x2') { R.x2 = 12; ui.toast('倍', 'Double score'); }
  else if (kind === 'shield') { R.shield = true; ui.toast('守', 'Lucky charm'); }
}

// ------------------------------------------------------------------ simulation
const laneOf = (x) => (x < -LANES[2] / 2 ? 0 : x > LANES[2] / 2 ? 2 : 1);

function simulate(dt) {
  R.t += dt;
  const base = speedAt(R.s) * (R.hover > 0 ? 1.25 : 1);
  R.speed = damp(R.speed, base, R.t < 2 ? 1.6 : 3, dt);
  const prev = R.s;
  R.s += R.speed * dt;
  const before = R.mult;
  R.mult = (1 + Math.floor(R.s / 1000)) * (R.x2 > 0 ? 2 : 1);
  if (1 + Math.floor(R.s / 1000) > 1 + Math.floor(prev / 1000)) { ui.toast('×' + (1 + Math.floor(R.s / 1000)), 'Speed up'); snd.power(); }
  void before;
  R.score += (R.s - prev) * R.mult;

  // lateral
  const tx = LANES[R.lane] + R.bump;
  const px = R.x;
  R.x = damp(R.x, tx, 17, dt);
  R.bump = damp(R.bump, 0, 9, dt);
  // lane change: lean and turn into it
  const dxl = tx - R.x; void px;
  hero.roll = damp(hero.roll, clamp(-dxl * 11, -20, 20), 14, dt);
  hero.yaw = damp(hero.yaw, clamp(-dxl * 9, -22, 22), 12, dt);
  const li = laneOf(R.x);
  let floor = course.surface(li, R.s);

  // timers
  const rollWas = R.roll, dodgeWas = R.dodgeT;
  for (const k of ['jumpBuf', 'coyote', 'roll', 'dodgeT', 'inv', 'magnet', 'x2', 'landT']) if (R[k] > 0) R[k] = Math.max(0, R[k] - dt);
  if (R.chase > 0) { R.chase -= dt; if (R.chase <= 0) { C.target = 9; } }

  if (R.hover > 0) {
    R.hover -= dt;
    R.y = damp(R.y, HOVER_Y + Math.sin(R.t * 2.2) * 0.18, 3.2, dt);
    R.vy = 0; R.grounded = false;
    if (R.hover <= 0) { R.inv = 1.8; R.ghost = true; snd.powerEnd(); hero.lockY = true; hero.play('run_jump', { loop: false, fade: 0.3, speed: 0.5, restart: true, at: 0.95 }); }
  } else {
    // solids: a wall is any surface more than a step above the feet
    // (probed half a metre ahead so the runner stops at the buffers, not inside the cab)
    // Ramps never kill: whatever the frame rate or the jump, the slope lifts the feet.
    const slope = course.rampH(li, R.s);
    if (slope > R.y) { R.y = slope; if (R.vy <= 0 && !R.grounded) { R.vy = 0; R.grounded = true; R.wantRoll = false; snd.land(); } }
    const wall = Math.max(course.trainH(li, R.s), course.trainH(li, R.s + 0.55)) > R.y + STEP;
    if (wall) {
      if (R.ghost || R.inv > 0) R.ghost = true;
      else if (hit('train', null)) return;
      else R.ghost = true;
      if (floor > R.y + STEP) floor = 0;
    } else if (R.ghost && R.inv <= 0) R.ghost = false;

    if (R.jumpBuf > 0 && (R.grounded || R.coyote > 0)) {
      R.vy = JUMP_V; R.grounded = false; R.coyote = 0; R.jumpBuf = 0; R.roll = 0; R.wantRoll = false;
      hero.lockY = true;
      hero.play(CLIP.jump.name, { loop: false, fade: 0.08, speed: CLIP.jump.air / (2 * JUMP_V / GRAV), restart: true, at: CLIP.jump.at });
      snd.jump();
    }
    if (R.grounded) {
      if (floor < R.y - 0.08) { R.grounded = false; R.coyote = 0.1; R.vy = 0; }
      else R.y = floor;
    }
    if (!R.grounded) {
      R.vy -= GRAV * dt;
      R.y += R.vy * dt;
      if (R.y <= floor && R.vy <= 0) {
        const hard = R.vy < -17;
        R.y = floor; R.vy = 0; R.grounded = true;
        snd.land();
        if (hard) { shake = Math.max(shake, 0.25); fx.burst(R.x, R.y + 0.2, 0, 8, { speed: 3 }); }
        hero.lockY = false;
        if (R.wantRoll) { R.wantRoll = false; startRoll(); }
        else hero.play(RUN_CLIP, { fade: 0.14, speed: animSpeed() });
      }
    }
  }

  // barriers
  for (const o of course.items) {
    if (o.gone || o.lane !== li) continue;
    if (prev + 0.35 < o.s && R.s + 0.35 >= o.s) {
      const clear = R.hover > 0 || (o.type === 'hurdle' ? R.y > 0.82 : (R.roll > 0 && R.y < 0.6) || R.y > 3.8);
      if (!clear && hit(o.type, o)) return;
    }
  }

  // leaves
  const hy = R.y + 1.0;
  for (const l of course.leaves) {
    const ds = l.s - R.s;
    if (ds > 13 || ds < -2.5 || l.taken) continue;
    if (R.magnet > 0 && ds < 12) l.pull = 1;
    if (l.pull) {
      l.x = damp(l.x, R.x, 16, dt); l.y = damp(l.y, hy, 16, dt); l.s = damp(l.s, R.s + 0.2, 12, dt) + R.speed * dt * 0.9;
    }
    if (Math.abs(l.s - R.s) < 0.95 && Math.abs(l.x - R.x) < 1.2 && Math.abs(l.y - hy) < 1.4) {
      l.taken = true; R.leaves++; R.score += 10 * R.mult;
      snd.leaf(); fx.burst(R.x, hy + 0.2, -0.4, 3, { gold: true, speed: 2.4, size: 0.7, life: 0.6 });
    }
  }
  for (const p of course.powers) {
    if (p.taken) continue;
    if (Math.abs(p.s - R.s) < 1.1 && Math.abs(LANES[p.lane] - R.x) < 1.3 && Math.abs(p.y - (R.y + 1)) < 1.8) {
      p.taken = true; p.ent.enabled = false; p.s = -1e9;
      fx.burst(R.x, R.y + 1.2, -0.5, 14, { gold: true, speed: 5 });
      grant(p.kind);
    }
  }

  // animation
  if (R.hover <= 0) {
    if (dodgeWas > 0 && R.dodgeT <= 0 && R.grounded && R.roll <= 0) hero.play(RUN_CLIP, { fade: 0.2, speed: animSpeed() });
    if (rollWas > 0) { if (R.roll <= 0 && R.grounded) hero.play(RUN_CLIP, { fade: 0.16, speed: animSpeed() }); }
    else if (R.grounded && hero.anim !== RUN_CLIP && R.dodgeT <= 0) hero.play(RUN_CLIP, { fade: 0.16, speed: animSpeed() });
    if (R.grounded && hero.anim === RUN_CLIP) hero.ch.playbackSpeed = animSpeed();
  }

  // HUD
  ui.score(R.score, R.leaves, R.mult, R.x2 > 0);
  const pw = [];
  if (R.hover > 0) pw.push({ kind: 'wind', left: R.hover, total: 7 });
  if (R.magnet > 0) pw.push({ kind: 'magnet', left: R.magnet, total: 10 });
  if (R.x2 > 0) pw.push({ kind: 'x2', left: R.x2, total: 12 });
  if (R.shield) pw.push({ kind: 'shield', left: 0, total: 0 });
  ui.powers(pw);
}

function autopilot() {
  if (R.hover > 0) return;
  const onStructure = course.surface(R.lane, R.s) > 0.05 || R.y > 2;
  const here = course.ahead(R.lane, R.s, 70);
  const wallDist = (l) => { const a = course.ahead(l, R.s, 70); return a && a.type === 'train' ? a.dist : a && a.type === 'ramp' ? 80 : 99; };
  if (here && here.type === 'hurdle' && here.dist < R.speed * 0.3 + 0.7 && R.grounded && !onStructure) jump();
  else if (here && here.type === 'gate' && here.dist < R.speed * 0.34 + 0.6 && !onStructure) { if (R.roll <= 0.25) roll(); }
  else if (here && here.type === 'train' && !onStructure && here.dist < (R.speed + (here.ref.speed || 0)) * 1.15 + 5) {
    let bestL = -1, bestD = here.dist + 4;
    for (const l of [R.lane - 1, R.lane + 1]) {
      if (l < 0 || l > 2) continue;
      let side = 0; for (const o of [-0.5, 0.5, 1.5]) side = Math.max(side, course.surface(l, R.s + o));
      if (side > R.y + STEP) continue;
      const d = wallDist(l);
      if (d > bestD) { bestD = d; bestL = l; }
    }
    if (bestL >= 0 && Math.abs(R.x - LANES[R.lane]) < 0.4) move(bestL - R.lane);
  }
}

// ------------------------------------------------------------------ frame
function frame(dtRaw) {
  const dt = Math.min(dtRaw, 0.05);
  if (paused) return;
  time += dt; stage.time = time;
  // characters: full sun on the paddies and the bridge, shade under the maples and beside the station
  // (a narrow range, eased over 40 m of track: a wider or quicker change reads as the character flickering)
  sunlit = damp(sunlit, sunAt(R.s), 1.5, dt);
  stage.splatSun.intensity = lerp(0.5, 0.68, sunlit); stage.splatSky.intensity = lerp(0.32, 0.37, sunlit);
  let scroll = 0;

  if (state === 'run') {
    if (AUTO) autopilot();
    const s0 = R.s;
    simulate(dt);
    scroll = (R.s - s0) / Math.max(dt, 1e-5);
    course.update(R.s, dt, time, () => { snd.horn(); });
  } else if (state === 'dead') {
    R.deadT += dt;
    R.s += R.recoil * dt; scroll = R.recoil; R.recoil = damp(R.recoil, 0, 5, dt);
    const floor = R.ghost ? 0 : Math.min(course.surface(laneOf(R.x), R.s), R.y);
    if (R.y > floor) { R.vy -= GRAV * dt; R.y = Math.max(floor, R.y + R.vy * dt); }
    course.update(R.s, dt, time, null);
    if (R.deadT > 2.1) finish();
  } else {
    course.update(R.s, dt, time, null);
  }

  stage.update(R.s, 1);
  props.blink.emissiveIntensity = (time * 2.2) % 1 < 0.5 ? 6 : 0.3; props.blink.update();

  // hero
  if (hero) {
    const blink = R.inv > 0 && state === 'run' ? (Math.sin(time * 38) > 0 ? 0.55 : 0) : R.shield && state === 'run' ? 0.16 + 0.1 * Math.sin(time * 5) : 0;
    if (blink !== hero._tint) { hero._tint = blink; R.shield && R.inv <= 0 ? hero.tint(blink, 0.75, 0.45, 1) : hero.tint(blink, 1, 1, 1); }
    if (state !== 'run') { hero.roll = damp(hero.roll, 0, 10, dt); hero.yaw = damp(hero.yaw, 0, 10, dt); }
    hero.x = R.x; hero.y = R.y; hero.z = 0; hero.pitch = 0; hero.update();
    const fl = state === 'title' ? 0 : Math.min(R.y, course.surface(laneOf(R.x), R.s));
    const k = 1 - Math.min(0.65, (R.y - fl) / 5);
    heroShadow.setLocalPosition(R.x, fl + 0.05, 0.05); heroShadow.setLocalScale(1.5 * k, 1, 1.5 * k);
  }

  // station master
  if (chaser) {
    C.t += dt;
    if (C.mode === 'wait') { C.gap = 5.5; C.x = -5.7; C.y = PLATFORM_Y; }
    else {
      if (C.mode === 'chase' && R.chase <= 0 && C.t > 3.2) C.target = 9.5;
      C.gap = damp(C.gap, C.target, C.mode === 'catch' ? 3 : 1.5, dt);
      C.x = damp(C.x, R.x, C.mode === 'catch' ? 4 : 3, dt);
      const gy = C.t < 0.5 ? PLATFORM_Y : Math.min(R.y, course.surface(laneOf(C.x), R.s - C.gap));
      C.y = damp(C.y, gy, 9, dt);
      if (C.mode === 'catch' && C.gap < C.target + 0.5) chaser.play('point_forward', { loop: true, fade: 0.3 });
      else chaser.play('running', { speed: C.mode === 'catch' ? 1.5 : 1.75 });
    }
    const vis = C.gap < 7.4;
    if (vis !== chaser._vis) { chaser._vis = vis; chaser.show(vis); chaserShadow.enabled = vis; }
    const point = C.mode === 'catch' && chaser.anim === 'point_forward';
    const want = C.mode === 'wait' ? -46 : point ? Math.atan2(R.x - C.x, 0 - C.gap) * 57.2958 + 180 : 0; // rigs face -Z at yaw 0
    chaser.yaw = C.mode === 'wait' ? want : damp(chaser.yaw, want, 3, dt);
    chaser.x = C.x; chaser.y = C.y; chaser.z = C.gap; chaser.update();
    chaserShadow.setLocalPosition(C.x, C.y + 0.05, C.gap + 0.05);
  }

  // camera
  shake = Math.max(0, shake - dt * 1.6);
  const sh = shake * shake * 0.6;
  let px, py, pz, lx, ly, lz, fov;
  if (state === 'title') {
    px = 2.3 + Math.sin(time * 0.3) * 0.3; py = 1.5 + Math.sin(time * 0.23) * 0.06; pz = -5.2; lx = 0.5; ly = 1.2; lz = 0.4; fov = 46;
    cam.y0 = 0;
  } else if (state === 'run') {
    cam.intro = Math.min(1, cam.intro + dt / 1.5);
    cam.y0 = damp(cam.y0, R.y, R.hover > 0 ? 3 : 5.5, dt);
    const k = smooth(cam.intro), sp01 = clamp((R.speed - 13.5) / 13.5, 0, 1);
    // portrait screens see a narrow slice: pull back and widen so all three tracks stay in frame
    const kp = clamp((1 - canvas.clientWidth / Math.max(1, canvas.clientHeight)) / 0.55, 0, 1);
    const ang = lerp(2.72, 0, k), rad = lerp(5.7, 5.6 + kp * 2.4, k);
    px = lerp(0, R.x * 0.72, k) + Math.sin(ang) * rad; pz = Math.cos(ang) * rad;
    py = lerp(1.5, cam.y0 * 0.86 + 2.95 + kp * 1.1, k);
    lx = lerp(0.5, R.x * 0.9, k); ly = lerp(1.2, cam.y0 * 0.9 + 1.25, k); lz = lerp(0.4, -10, k);
    fov = lerp(46, 60 + sp01 * 9 + (R.hover > 0 ? 5 : 0) + kp * 22, k);
  } else {
    const side = R.x > 0.5 ? -1 : 1;
    px = R.x + side * 3.1; py = R.y + 1.75; pz = 3.9; lx = R.x; ly = R.y + 0.95; lz = 0.5; fov = 50;
  }
  const rate = state === 'run' && cam.intro < 1 ? 30 : state === 'run' ? 12 : 2.6;
  cam.x = damp(cam.x, px, rate, dt); cam.y = damp(cam.y, py, rate, dt); cam.z = damp(cam.z, pz, rate, dt);
  cam.lx = damp(cam.lx, lx, rate, dt); cam.ly = damp(cam.ly, ly, rate, dt); cam.lz = damp(cam.lz, lz, rate, dt);
  cam.fov = damp(cam.fov, fov, 4, dt);
  stage.cam.setPosition(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z);
  stage.cam.lookAt(cam.lx, cam.ly, cam.lz);
  if (DEBUG && window.FREECAM) { const f = window.FREECAM; stage.cam.setPosition(f[0], f[1], f[2]); stage.cam.lookAt(f[3], f[4], f[5]); cam.fov = f[6] || 55; }
  stage.cam.camera.fov = cam.fov;

  fx.update(dt, scroll, time, R.hover > 0 ? 1.2 : 0);
  if (state === 'run' && R.grounded && R.y < 0.1 && Math.random() < dt * 5) fx.burst(R.x, 0.1, 0.5, 1, { speed: 1.6, vz: 2, life: 0.7 });
  snd.tick(clamp((R.speed - 13.5) / 13.5, 0, 1));
  snd.wind(state === 'run' ? clamp(R.speed / 27, 0, 1) * (R.hover > 0 ? 1.6 : 1) : 0.15);
}
