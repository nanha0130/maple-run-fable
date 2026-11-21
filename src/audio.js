// All sound is synthesised: koto-like plucks over taiko on a yo pentatonic scale, wind, and the game's effects.
const YO = [0, 2, 5, 7, 9]; // D E G A B
const PENTA = [0, 2, 4, 7, 9], MELODY = [0, -1, 2, 4, -1, 3, 2, -1, 1, -1, 4, 2, -1, 5, 3, 1];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const hz = (deg, oct = 0) => 146.83 * Math.pow(2, oct + (YO[((deg % 5) + 5) % 5] + 12 * Math.floor(deg / 5)) / 12);

export class Sound {
  constructor() {
    this.ctx = null; this.muted = localStorage.getItem('maple.mute') === '1';
    this.playing = false; this.tempo = 116; this.step = 0; this.nextT = 0; this.combo = 0; this.comboT = 0;
    this.seed = 7;
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.silent) return; // debug / capture runs make no sound
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    // a touch of space for the plucks
    const d = c.createDelay(0.5); d.delayTime.value = 0.19; const fb = c.createGain(); fb.gain.value = 0.26;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.music);
    this.echo = d;
    // a short room for the music strings
    this.verb = c.createConvolver(); this.ks = new Map();
    { const len = Math.floor(c.sampleRate * 2.2), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const dd = ir.getChannelData(ch); for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      this.verb.buffer = ir; const vg = c.createGain(); vg.gain.value = 0.28; this.verb.connect(vg); vg.connect(this.master); }
    // noise buffer
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const ch = nb.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // wind bed
    const w = c.createBufferSource(); w.buffer = nb; w.loop = true;
    const wf = (this.windF = c.createBiquadFilter()); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
    const wg = (this.windG = c.createGain()); wg.gain.value = 0;
    w.connect(wf); wf.connect(wg); wg.connect(this.master); w.start();
  }

  setMuted(m) { this.muted = m; localStorage.setItem('maple.mute', m ? '1' : '0'); if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  _env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  pluck(f, t, vol = 0.2, dur = 0.7, dest = null) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), flt = c.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 2.003;
    // koto: sharp attack with a slight downward pitch settle
    o.frequency.setValueAtTime(f * 1.018, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    flt.type = 'lowpass'; flt.frequency.setValueAtTime(5200, t); flt.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.25;
    o.connect(flt); o2.connect(g2); g2.connect(flt); flt.connect(g);
    this._env(g, t, 0.004, dur, vol);
    g.connect(dest || this.music); if (!dest) g.connect(this.echo);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  drum(t, f0 = 120, vol = 0.5, dur = 0.24) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.38, t + dur);
    this._env(g, t, 0.003, dur, vol); o.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + 0.05);
    this.hiss(t, 0.03, vol * 0.3, 1800, this.music);
  }

  hiss(t, dur, vol, freq = 6000, dest = null, type = 'highpass') {
    const c = this.ctx; if (!c) return;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); this._env(g, t, 0.002, dur, vol);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return f;
  }

  tone(f0, f1, dur, vol = 0.2, type = 'sine', when = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this._env(g, t, 0.006, dur, vol); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------- music ----------
  // The loop from the first Maple Run: plucked strings (Karplus-Strong) on a major pentatonic over a light drum
  // pattern, 132 bpm, a fixed 16-step figure that walks a four-bar chord cycle. Fixed on purpose: a generated
  // melody with a moving tempo read as noise.
  _ksBuffer(freq) {
    const key = Math.round(freq); if (this.ks.has(key)) return this.ks.get(key);
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 1.8), buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const N = Math.round(sr / freq), ring = new Float32Array(N); for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let p = 0; for (let i = 0; i < len; i++) { const nx = (p + 1) % N, v = (ring[p] + ring[nx]) * 0.5 * 0.994; d[i] = ring[p]; ring[p] = v; p = nx; }
    this.ks.set(key, buf); return buf;
  }
  _string(freq, t, vel) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this._ksBuffer(freq);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    const g = c.createGain(); g.gain.value = vel; src.connect(f); f.connect(g); g.connect(this.music); g.connect(this.verb); src.start(t);
  }
  _beat(t, f0, f1, dur, vel, noise = 0) {
    const c = this.ctx;
    if (vel > 0) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
      g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.music); o.start(t); o.stop(t + dur + 0.05);
    }
    if (noise) this.hiss(t, 0.06, noise, 6000, this.music);
  }
  startMusic() {
    if (!this.ctx) return;
    this.playing = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.music.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.5);
  }
  stopMusic(fade = 0.5) { this.playing = false; if (this.ctx) this.music.gain.setTargetAtTime(0.0, this.ctx.currentTime, fade); }
  duck(k) { if (this.ctx) this.music.gain.setTargetAtTime(k, this.ctx.currentTime, 0.2); }

  /** Call every frame. */
  tick() {
    const c = this.ctx; if (!c || !this.playing) return;
    const spb = 60 / 132 / 4; // a 16th
    if (this.nextT < c.currentTime - 0.2) this.nextT = c.currentTime + 0.05; // after a pause or a hidden tab: skip, don't catch up
    while (this.nextT < c.currentTime + 0.2) {
      const t = this.nextT, i = this.step % 16, bar = Math.floor(this.step / 16) % 4;
      if (i === 0 || i === 6 || i === 10) this._beat(t, 140, 50, 0.25, 0.5);
      if (i === 4 || i === 12) this._beat(t, 320, 180, 0.12, 0.22, 0.08);
      if (i % 2 === 1) this._beat(t, 0, 0, 0, 0, 0.035);
      const root = [62, 57, 59, 55][bar];
      const k = MELODY[i];
      if (k >= 0) this._string(midi(root + 12 + PENTA[k % 5] + Math.floor(k / 5) * 12), t, 0.22 + (i % 4 === 0 ? 0.08 : 0));
      if (i === 0 || i === 8) this._string(midi(root - 12), t, 0.35);
      this.nextT += spb; this.step++;
    }
  }

  wind(level) { if (this.ctx) { this.windG.gain.setTargetAtTime(0.02 + level * 0.11, this.ctx.currentTime, 0.3); this.windF.frequency.setTargetAtTime(380 + level * 900, this.ctx.currentTime, 0.3); } }

  // ---------- effects ----------
  leaf() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.combo = now - this.comboT < 0.6 ? Math.min(this.combo + 1, 14) : 0; this.comboT = now;
    this.pluck(hz(5 + this.combo, 1), now, 0.16, 0.25, this.sfx);
  }
  jump() { this.tone(260, 620, 0.16, 0.13, 'triangle'); this.hiss(this.ctx?.currentTime || 0, 0.12, 0.05, 2500); }
  roll() { if (this.ctx) this.hiss(this.ctx.currentTime, 0.28, 0.1, 900, null, 'bandpass'); this.tone(200, 110, 0.2, 0.09, 'triangle'); }
  land() { this.tone(140, 60, 0.1, 0.2); if (this.ctx) this.hiss(this.ctx.currentTime, 0.06, 0.07, 1200, null, 'lowpass'); }
  swish() { if (this.ctx) this.hiss(this.ctx.currentTime, 0.09, 0.05, 3200, null, 'bandpass'); }
  bump() { this.tone(180, 70, 0.16, 0.3, 'square'); if (this.ctx) this.hiss(this.ctx.currentTime, 0.1, 0.16, 800, null, 'lowpass'); }
  crash() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.tone(120, 34, 0.5, 0.6); this.hiss(t, 0.5, 0.4, 500, null, 'lowpass'); this.hiss(t, 0.18, 0.22, 3000);
    this.tone(880, 220, 0.3, 0.07, 'sawtooth', 0.02);
  }
  whistle() { // station master
    if (!this.ctx) return;
    for (const w of [0, 0.22]) { this.tone(2350, 2300, 0.16, 0.12, 'sine', w); this.tone(2420, 2380, 0.16, 0.08, 'sine', w); }
  }
  horn() { for (const f of [311, 370]) { this.tone(f, f * 0.985, 0.9, 0.16, 'sawtooth'); this.tone(f * 2, f * 1.97, 0.9, 0.04, 'square'); } }
  power() { [5, 7, 9, 12].forEach((d, i) => this.ctx && this.pluck(hz(d, 1), this.ctx.currentTime + i * 0.07, 0.2, 0.4, this.sfx)); }
  powerEnd() { this.tone(660, 330, 0.25, 0.1, 'triangle'); }
  shield() { this.tone(1200, 300, 0.4, 0.2, 'triangle'); if (this.ctx) this.hiss(this.ctx.currentTime, 0.3, 0.14, 4000); }
  click() { this.tone(700, 900, 0.06, 0.1, 'triangle'); }
  start() { [0, 2, 4, 7].forEach((d, i) => this.ctx && this.pluck(hz(d + 5, 0), this.ctx.currentTime + i * 0.09, 0.2, 0.5, this.sfx)); }
  over() { [9, 7, 5, 3, 0].forEach((d, i) => this.ctx && this.pluck(hz(d, 0), this.ctx.currentTime + 0.5 + i * 0.16, 0.2, 0.9, this.sfx)); }
  record() { [5, 7, 9, 10, 12, 14].forEach((d, i) => this.ctx && this.pluck(hz(d, 1), this.ctx.currentTime + i * 0.08, 0.18, 0.6, this.sfx)); }
}
