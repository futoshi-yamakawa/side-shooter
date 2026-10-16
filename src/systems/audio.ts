// Procedural audio: every sound effect and both music tracks are synthesized
// with the Web Audio API at runtime, so there are no audio files to license.

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  private noise: AudioBuffer;
  private last: Record<string, number> = {};
  music: Music;

  constructor() {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);

    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.music = new Music(this);
  }

  resume() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  get now() {
    return this.ctx.currentTime;
  }

  // Drops a sound if the same one played within `gap` seconds; stops dense
  // gunfire from turning into a wall of noise.
  private throttle(key: string, gap: number) {
    const t = this.now;
    if (this.last[key] !== undefined && t - this.last[key] < gap) return false;
    this.last[key] = t;
    return true;
  }

  osc(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = this.now, out: AudioNode = this.sfxBus) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  noiseHit(filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, at = this.now, out: AudioNode = this.sfxBus, q = 0.7) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(out);
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur + 0.02);
  }

  // ---- sound effects ----
  shot() {
    if (!this.throttle('shot', 0.06)) return;
    this.osc('square', 1400, 500, 0.05, 0.025);
    this.noiseHit('highpass', 6000, 3000, 0.03, 0.03);
  }
  hit() {
    if (!this.throttle('hit', 0.035)) return;
    this.noiseHit('bandpass', 3500, 1800, 0.04, 0.12, this.now, this.sfxBus, 2);
  }
  armor() {
    if (!this.throttle('armor', 0.05)) return;
    this.osc('square', 2400, 1800, 0.03, 0.03);
  }
  explodeSmall() {
    if (!this.throttle('exs', 0.03)) return;
    this.noiseHit('lowpass', 3000, 200, 0.35, 0.35);
    this.osc('sine', 160, 40, 0.25, 0.4);
  }
  explodeMid() {
    this.noiseHit('lowpass', 4000, 120, 0.7, 0.5);
    this.osc('sine', 120, 30, 0.5, 0.6);
    this.osc('sawtooth', 90, 30, 0.3, 0.1);
  }
  explodeBig() {
    const t = this.now;
    this.noiseHit('lowpass', 5000, 80, 1.8, 0.7, t);
    this.noiseHit('bandpass', 1200, 200, 1.2, 0.3, t + 0.05, this.sfxBus, 1.5);
    this.osc('sine', 90, 25, 1.4, 0.8, t);
    this.osc('sawtooth', 60, 20, 0.9, 0.15, t);
  }
  impact() {
    this.noiseHit('lowpass', 2500, 100, 0.5, 0.5);
    this.osc('square', 110, 55, 0.35, 0.12);
    this.osc('sine', 70, 30, 0.6, 0.6);
  }
  powerup() {
    const t = this.now;
    [0, 4, 7, 12, 16].forEach((n, i) => this.osc('triangle', mtof(72 + n), mtof(72 + n), 0.12, 0.12, t + i * 0.045));
  }
  item() {
    if (!this.throttle('item', 0.03)) return;
    this.osc('sine', 1800 + Math.random() * 300, 2400, 0.05, 0.035);
  }
  death() {
    const t = this.now;
    this.osc('sawtooth', 900, 40, 0.9, 0.18, t);
    this.explodeMid();
  }
  warning() {
    const t = this.now;
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.5;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      o.type = 'square';
      f.type = 'lowpass';
      f.frequency.value = 1800;
      o.frequency.setValueAtTime(660, at);
      o.frequency.setValueAtTime(495, at + 0.25);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.09, at + 0.02);
      g.gain.setValueAtTime(0.09, at + 0.46);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
      o.connect(f).connect(g).connect(this.sfxBus);
      o.start(at);
      o.stop(at + 0.52);
    }
  }
  rumble(dur: number) {
    this.noiseHit('lowpass', 200, 60, dur, 0.5);
    this.osc('sine', 45, 35, dur, 0.4);
  }
  clear() {
    const t = this.now;
    const seq = [60, 64, 67, 72, 67, 72, 76, 79];
    seq.forEach((n, i) => {
      this.osc('square', mtof(n), mtof(n), 0.18, 0.06, t + i * 0.1);
      this.osc('triangle', mtof(n - 12), mtof(n - 12), 0.2, 0.1, t + i * 0.1);
    });
  }
  bell() {
    const t = this.now;
    this.osc('sine', 1568, 1568, 0.25, 0.12, t);
    this.osc('sine', 2093, 2093, 0.35, 0.08, t + 0.04);
  }
  bomb() {
    const t = this.now;
    this.osc('sawtooth', 60, 600, 0.5, 0.18, t);
    this.noiseHit('bandpass', 400, 4000, 0.5, 0.3, t, this.sfxBus, 1);
    this.explodeBig();
  }
  shieldBreak() {
    this.osc('triangle', 1800, 300, 0.3, 0.15);
    this.noiseHit('highpass', 5000, 2000, 0.2, 0.15);
  }
  pause() {
    this.osc('square', 660, 660, 0.06, 0.06);
    this.osc('square', 990, 990, 0.08, 0.06, this.now + 0.07);
  }
  select() {
    this.osc('square', 880, 1760, 0.12, 0.08);
  }
}

type Track = {
  bpm: number;
  roots: number[];
  chord: number[][];
  bass: number[];
  kick: number[];
  snare: number[];
  hat: number[];
  arpOct: number;
  lead?: (number | null)[];
};

const STAGE: Track = {
  bpm: 132,
  roots: [45, 41, 48, 43],
  chord: [[0, 3, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12], [0, 4, 7, 11]],
  bass: [0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 7, 12],
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [2, 6, 10, 14],
  arpOct: 24,
};

const BOSS: Track = {
  bpm: 152,
  roots: [38, 34, 36, 33],
  chord: [[0, 3, 6, 12], [0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 10]],
  bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 1, 0, 12, 13],
  kick: [0, 3, 4, 8, 11, 12],
  snare: [4, 12],
  hat: [1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15],
  arpOct: 24,
};

export class Music {
  private timer: number | null = null;
  private step = 0;
  private next = 0;
  private track: Track = STAGE;
  private bus: GainNode;
  private delay: DelayNode;

  constructor(private a: AudioEngine) {
    this.bus = a.ctx.createGain();
    this.bus.connect(a.musicBus);
    // Short feedback echo on the arpeggio gives the synthwave "space" cheaply.
    this.delay = a.ctx.createDelay(1);
    const fb = a.ctx.createGain();
    fb.gain.value = 0.32;
    const wet = a.ctx.createGain();
    wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.bus);
  }

  play(name: 'stage' | 'boss') {
    this.stop();
    this.track = name === 'stage' ? STAGE : BOSS;
    this.delay.delayTime.value = (60 / this.track.bpm) * 0.75;
    this.step = 0;
    this.next = this.a.now + 0.06;
    this.bus.gain.cancelScheduledValues(this.a.now);
    this.bus.gain.setValueAtTime(1, this.a.now);
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  fadeOut(sec: number) {
    const t = this.a.now;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + sec);
    window.setTimeout(() => this.stop(), sec * 1000 + 50);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const spb = 60 / this.track.bpm / 4;
    while (this.next < this.a.now + 0.12) {
      this.playStep(this.step, this.next, spb);
      this.next += spb;
      this.step++;
    }
  }

  private playStep(step: number, t: number, spb: number) {
    const tr = this.track;
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const root = tr.roots[bar];
    const a = this.a;

    if (tr.kick.includes(s)) a.osc('sine', 150, 42, 0.22, 0.75, t, this.bus);
    if (tr.snare.includes(s)) {
      a.noiseHit('highpass', 1200, 900, 0.16, 0.28, t, this.bus);
      a.osc('triangle', 200, 140, 0.1, 0.18, t, this.bus);
    }
    if (tr.hat.includes(s)) a.noiseHit('highpass', 8000, 7000, 0.035, 0.09, t, this.bus);

    // bass
    const bn = root + tr.bass[s];
    this.voice('sawtooth', mtof(bn), t, spb * 0.9, 0.16, 900, 180);

    // arpeggio
    const ch = tr.chord[bar];
    const an = root + tr.arpOct + ch[s % ch.length] + (s >= 8 ? 12 : 0);
    this.voice('square', mtof(an), t, spb * 0.8, 0.045, 3200, 1200, true);
  }

  private voice(type: OscillatorType, f: number, t: number, dur: number, vol: number, cut0: number, cut1: number, send = false) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator();
    const flt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    flt.type = 'lowpass';
    flt.Q.value = 4;
    flt.frequency.setValueAtTime(cut0, t);
    flt.frequency.exponentialRampToValueAtTime(cut1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt).connect(g).connect(this.bus);
    if (send) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

let engine: AudioEngine | null = null;
export function audio(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
