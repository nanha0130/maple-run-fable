// All sound is synthesised: koto-like plucks over taiko on a yo pentatonic scale, wind, and the game's effects.
const YO = [0, 2, 5, 7, 9]; // D E G A B
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
  startMusic() {
    if (!this.ctx) return;
    this.playing = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.08;
    this.music.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4);
    this.motif = this._motif();
  }
  stopMusic(fade = 0.5) { this.playing = false; if (this.ctx) this.music.gain.setTargetAtTime(0.0, this.ctx.currentTime, fade); }
  duck(k) { if (this.ctx) this.music.gain.setTargetAtTime(k, this.ctx.currentTime, 0.2); }

  _motif() {
    // 16 steps of scale degrees (null = rest), built as a random walk that leans back to the tonic
    const m = []; let d = 5 + Math.floor(this._rand() * 4);
    for (let i = 0; i < 16; i++) {
      if (i % 4 !== 0 && this._rand() < 0.3) { m.push(null); continue; }
      d += Math.floor(this._rand() * 5) - 2; d = Math.max(3, Math.min(12, d));
      m.push(d);
    }
    m[0] = 5; m[15] = this._rand() < 0.5 ? 7 : 5;
    return m;
  }

  /** Call every frame. speed01: 0..1 game pace. */
  tick(speed01 = 0) {
    const c = this.ctx; if (!c || !this.playing) return;
    this.tempo = 112 + speed01 * 40;
    const spb = 60 / this.tempo / 4; // 16th
    if (this.nextT < c.currentTime - 0.2) this.nextT = c.currentTime + 0.05; // after a pause or a hidden tab: skip, don't catch up
    while (this.nextT < c.currentTime + 0.12) {
      const t = this.nextT, s = this.step, bar = Math.floor(s / 16), i = s % 16;
      if (i === 0 && bar % 4 === 0 && bar > 0) this.motif = this._motif();
      // taiko: steady drive with a syncopated answer
      if (i % 8 === 0) this.drum(t, 92, 0.62, 0.3);
      if (i === 6 || i === 11 || (i === 14 && bar % 2)) this.drum(t, 150, 0.32, 0.14);
      if (i % 4 === 2) this.hiss(t, 0.035, 0.07, 7000, this.music);
      if (i % 2 === 1 && bar % 4 >= 2) this.hiss(t, 0.02, 0.035, 9000, this.music);
      // bass on the tonic / fifth
      if (i % 8 === 0 || i === 10) {
        const root = [0, 0, 3, 2][bar % 4];
        this.pluck(hz(root, -1), t, 0.22, 0.5);
      }
      const n = this.motif[i];
      if (n != null && bar >= 1) {
        this.pluck(hz(n, bar % 8 >= 4 ? 1 : 0), t, 0.13, 0.55);
        if (i % 8 === 0 && bar % 2) this.pluck(hz(n + 2, 0), t + spb * 0.5, 0.06, 0.4);
      }
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
