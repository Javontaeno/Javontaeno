// Everything here is synthesised at runtime with WebAudio — no audio files.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.combat = 0;
    this.combatTarget = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // wind (speed driven)
    this.wind = this.loop(this.noise, 'bandpass', 600, 0);
    // city ambience
    this.amb = this.loop(this.brown, 'lowpass', 400, 0.18);
    this.sirenT = 6;
    this.startMusic();
  }

  loop(buf, type, freq, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.sfx);
    src.start();
    return { src, f, g };
  }

  t() { return this.ctx.currentTime; }

  burst({ freq = 1000, q = 1, type = 'bandpass', dur = 0.1, gain = 0.5, sweep = 0, delay = 0, dest }) {
    if (!this.ctx) return;
    const t = this.t() + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  tone({ freq = 440, to = 0, type = 'sine', dur = 0.2, gain = 0.3, delay = 0, attack = 0.004, dest }) {
    if (!this.ctx) return;
    const t = this.t() + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  thwip(black) {
    this.burst({ freq: black ? 900 : 2600, q: 2.5, dur: 0.13, gain: 0.35, sweep: 0.35 });
    this.burst({ freq: 5000, q: 1, type: 'highpass', dur: 0.05, gain: 0.12 });
    if (black) this.tone({ freq: 140, to: 60, type: 'sawtooth', dur: 0.15, gain: 0.08 });
  }
  punch(heavy, black) {
    this.tone({ freq: heavy ? 150 : 190, to: 45, dur: heavy ? 0.22 : 0.13, gain: heavy ? 0.9 : 0.6 });
    this.burst({ freq: heavy ? 900 : 1600, q: 0.8, dur: heavy ? 0.12 : 0.07, gain: heavy ? 0.6 : 0.4, sweep: 0.4 });
    if (black) {
      this.tone({ freq: 90, to: 40, type: 'sawtooth', dur: 0.25, gain: 0.18 });
      this.burst({ freq: 400, q: 6, dur: 0.18, gain: 0.25, sweep: 2.5 });
    }
  }
  whoosh(big) { this.burst({ freq: big ? 500 : 900, q: 1.2, dur: big ? 0.35 : 0.18, gain: big ? 0.3 : 0.18, sweep: 2.2 }); }
  gun(dist) {
    const g = Math.max(0.05, 1 - dist / 120);
    this.burst({ freq: 2400, q: 0.6, dur: 0.12, gain: 0.7 * g, type: 'highpass' });
    this.tone({ freq: 120, to: 40, dur: 0.18, gain: 0.6 * g });
    this.burst({ freq: 700, q: 0.5, dur: 0.5, gain: 0.08 * g, delay: 0.05 });
  }
  sense() {
    this.tone({ freq: 1760, dur: 0.25, gain: 0.12, type: 'triangle' });
    this.tone({ freq: 2349, dur: 0.3, gain: 0.08, type: 'sine', delay: 0.04 });
  }
  perfect() {
    this.tone({ freq: 220, to: 880, dur: 0.35, gain: 0.2, type: 'triangle' });
    this.burst({ freq: 3000, q: 4, dur: 0.4, gain: 0.15, sweep: 0.25 });
  }
  land(hard) {
    this.tone({ freq: hard ? 110 : 160, to: 40, dur: hard ? 0.35 : 0.12, gain: hard ? 0.8 : 0.3 });
    this.burst({ freq: 500, q: 0.6, dur: hard ? 0.4 : 0.1, gain: hard ? 0.4 : 0.15, sweep: 0.3 });
  }
  boom() {
    this.tone({ freq: 80, to: 30, dur: 0.8, gain: 0.9 });
    this.burst({ freq: 800, q: 0.4, dur: 0.9, gain: 0.5, sweep: 0.15 });
  }
  suit(black) {
    this.burst({ freq: black ? 300 : 1200, q: 3, dur: 0.6, gain: 0.3, sweep: black ? 3 : 0.3 });
    this.tone({ freq: black ? 55 : 110, to: black ? 30 : 220, type: 'sawtooth', dur: 0.6, gain: 0.15 });
  }
  hurt() { this.tone({ freq: 300, to: 120, type: 'square', dur: 0.12, gain: 0.08 }); this.burst({ freq: 700, dur: 0.15, gain: 0.3, sweep: 0.5 }); }
  ui() { this.tone({ freq: 880, dur: 0.08, gain: 0.1, type: 'triangle' }); }
  reward() { [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.4, gain: 0.12, type: 'triangle', delay: i * 0.08 })); }
  hive() { this.tone({ freq: 70, to: 35, type: 'sawtooth', dur: 0.4, gain: 0.25 }); this.burst({ freq: 300, q: 8, dur: 0.3, gain: 0.3, sweep: 0.5 }); }
  screech() { this.burst({ freq: 1800, q: 10, dur: 0.35, gain: 0.12, sweep: 0.5 }); this.tone({ freq: 600, to: 300, type: 'sawtooth', dur: 0.3, gain: 0.05 }); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.t(), 0.05);
  }

  update(dt, speed, inCombat) {
    if (!this.ctx) return;
    const s = Math.min(1, speed / 50);
    this.wind.g.gain.setTargetAtTime(s * s * 0.5, this.t(), 0.1);
    this.wind.f.frequency.setTargetAtTime(300 + s * 1400, this.t(), 0.1);
    this.combatTarget = inCombat ? 1 : 0;
    this.combat += (this.combatTarget - this.combat) * Math.min(1, dt * (inCombat ? 2 : 0.4));
    this.sirenT -= dt;
    if (this.sirenT < 0) {
      this.sirenT = 20 + Math.random() * 30;
      const t = this.t(), o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle';
      for (let i = 0; i < 8; i++) { o.frequency.setValueAtTime(700, t + i * 0.9); o.frequency.linearRampToValueAtTime(1100, t + i * 0.9 + 0.45); o.frequency.linearRampToValueAtTime(700, t + i * 0.9 + 0.9); }
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.02, t + 1.5); g.gain.linearRampToValueAtTime(0.0001, t + 7);
      o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 7.2);
    }
  }

  // --- adaptive score: ambient pad always, drums + bass fade in with combat ---
  startMusic() {
    const ctx = this.ctx;
    this.bpm = 128;
    this.step = 0;
    this.nextT = ctx.currentTime + 0.1;
    const roots = [38, 34, 41, 36]; // D, Bb, F, C (as MIDI)
    this.prog = roots;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    this.mtof = mtof;
    this.timer = setInterval(() => {
      if (!this.ctx) return;
      const spb = 60 / this.bpm / 4; // sixteenth
      while (this.nextT < ctx.currentTime + 0.12) {
        this.sched(this.step, this.nextT, spb);
        this.nextT += spb;
        this.step++;
      }
    }, 30);
  }

  sched(step, t, spb) {
    const bar = Math.floor(step / 16) % 4, s = step % 16;
    const root = this.prog[bar];
    const c = this.combat;
    const bus = this.musicBus;
    if (s === 0) {
      // pad chord
      for (const iv of [0, 7, 12, 15, 19]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = this.mtof(root + 12 + iv); o.detune.value = (Math.random() - 0.5) * 14;
        f.type = 'lowpass'; f.frequency.value = 700 + c * 900;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.025, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + spb * 16 + 0.3);
        o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + spb * 16 + 0.4);
      }
    }
    // arp
    if (s % 2 === 0) {
      const arp = [0, 7, 12, 15, 19, 15, 12, 7];
      const n = root + 24 + arp[(s / 2) % 8];
      this.tone({ freq: this.mtof(n), dur: spb * 1.6, gain: 0.03 + 0.02 * c, type: 'triangle', delay: Math.max(0, t - this.t()), dest: bus });
    }
    if (c < 0.05) return;
    // drums
    const kick = s === 0 || s === 6 || s === 8 || s === 11;
    if (kick) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.5 * c, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(bus); o.start(t); o.stop(t + 0.3);
    }
    if (s === 4 || s === 12) this.burst({ freq: 1800, q: 0.7, dur: 0.16, gain: 0.35 * c, delay: Math.max(0, t - this.t()), dest: bus });
    if (s % 2 === 1 || s % 4 === 2) this.burst({ freq: 9000, type: 'highpass', q: 0.7, dur: 0.035, gain: 0.08 * c, delay: Math.max(0, t - this.t()), dest: bus });
    // bass
    if ([0, 3, 6, 8, 10, 14].includes(s)) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = this.mtof(root + (s === 14 ? 12 : 0));
      f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + 0.15); f.Q.value = 6;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * c, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.8);
      o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + spb * 2);
    }
  }
}
