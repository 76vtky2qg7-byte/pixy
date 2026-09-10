/**
 * Audio.
 *
 * Every sound is synthesised at runtime — no audio files, so the whole sound
 * design costs zero download. The context is created but stays suspended until
 * a real user gesture resumes it, which is what browser autoplay policy
 * requires and what the "tap to start" screen is for.
 *
 * Music and effects have independent gain nodes so the two settings sliders are
 * genuinely independent, and both are persisted by the caller.
 */
export type SfxName =
  | 'shoot' | 'hit' | 'kill' | 'explode' | 'zap' | 'pickup' | 'scrap'
  | 'hurt' | 'buy' | 'place' | 'select' | 'deny' | 'warn' | 'overheat'
  | 'overdrive' | 'waveStart' | 'waveEnd' | 'lose' | 'win' | 'boss';

interface SfxSpec {
  type: OscillatorType;
  /** Start and end frequency of the pitch sweep, in Hz. */
  f0: number;
  f1: number;
  duration: number;
  gain: number;
  /** Optional noise burst mixed in, 0..1. */
  noise?: number;
  /** Low-pass cutoff; keeps the palette from getting shrill on phone speakers. */
  cutoff?: number;
  /** Minimum gap between two plays of this sound, in seconds. */
  throttle?: number;
}

const SFX: Record<SfxName, SfxSpec> = {
  shoot:     { type: 'square',   f0: 620,  f1: 240,  duration: 0.06, gain: 0.16, cutoff: 3200, throttle: 0.045 },
  hit:       { type: 'square',   f0: 340,  f1: 180,  duration: 0.05, gain: 0.12, noise: 0.5, cutoff: 2600, throttle: 0.035 },
  kill:      { type: 'triangle', f0: 260,  f1: 70,   duration: 0.14, gain: 0.2,  noise: 0.6, cutoff: 2200, throttle: 0.05 },
  explode:   { type: 'sawtooth', f0: 190,  f1: 40,   duration: 0.34, gain: 0.3,  noise: 0.9, cutoff: 1500, throttle: 0.07 },
  zap:       { type: 'sawtooth', f0: 1500, f1: 420,  duration: 0.09, gain: 0.14, cutoff: 5200, throttle: 0.05 },
  pickup:    { type: 'triangle', f0: 720,  f1: 1180, duration: 0.08, gain: 0.16, cutoff: 6000, throttle: 0.03 },
  scrap:     { type: 'square',   f0: 480,  f1: 880,  duration: 0.07, gain: 0.14, cutoff: 5000, throttle: 0.03 },
  hurt:      { type: 'sawtooth', f0: 300,  f1: 90,   duration: 0.22, gain: 0.3,  noise: 0.4, cutoff: 1800 },
  buy:       { type: 'triangle', f0: 520,  f1: 980,  duration: 0.13, gain: 0.24, cutoff: 6000 },
  place:     { type: 'square',   f0: 380,  f1: 560,  duration: 0.07, gain: 0.18, cutoff: 4200 },
  select:    { type: 'square',   f0: 700,  f1: 700,  duration: 0.035, gain: 0.12, cutoff: 4200 },
  deny:      { type: 'square',   f0: 200,  f1: 140,  duration: 0.14, gain: 0.2,  cutoff: 1600 },
  warn:      { type: 'sawtooth', f0: 240,  f1: 300,  duration: 0.2,  gain: 0.16, cutoff: 1400, throttle: 0.25 },
  overheat:  { type: 'sawtooth', f0: 420,  f1: 150,  duration: 0.3,  gain: 0.2,  noise: 0.5, cutoff: 1700, throttle: 0.5 },
  overdrive: { type: 'triangle', f0: 300,  f1: 1300, duration: 0.4,  gain: 0.26, cutoff: 7000 },
  waveStart: { type: 'square',   f0: 180,  f1: 420,  duration: 0.35, gain: 0.26, cutoff: 3000 },
  waveEnd:   { type: 'triangle', f0: 620,  f1: 300,  duration: 0.4,  gain: 0.26, cutoff: 4000 },
  lose:      { type: 'sawtooth', f0: 380,  f1: 60,   duration: 0.9,  gain: 0.3,  cutoff: 1400 },
  win:       { type: 'triangle', f0: 420,  f1: 1250, duration: 0.7,  gain: 0.3,  cutoff: 6000 },
  boss:      { type: 'sawtooth', f0: 120,  f1: 60,   duration: 0.8,  gain: 0.34, noise: 0.3, cutoff: 900 },
};

/** Music is two looping layers: a calm one for menus, a driving one for combat. */
export type MusicMood = 'none' | 'menu' | 'combat' | 'boss';

const SCALE_MINOR = [0, 3, 5, 7, 10, 12];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private mood: MusicMood = 'none';
  private step = 0;
  private lastPlayed = new Map<SfxName, number>();

  private sfxVolume = 0.75;
  private musicVolume = 0.5;
  private muted = false;
  private unlocked = false;

  /** Create the context. Safe before any gesture; it starts suspended. */
  init(): void {
    if (this.ctx) return;
    const Ctor = globalThis.AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;   // audio is optional; the game must still run without it
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume * 0.4;
    this.musicGain.connect(this.master);

    // One second of white noise, reused by every percussive sound.
    const len = Math.floor(this.ctx.sampleRate);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Call from a real user gesture (click/tap/keydown). */
  async unlock(): Promise<void> {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { /* user gesture was not accepted */ }
    }
    this.unlocked = this.ctx.state === 'running';
  }

  get ready(): boolean {
    return this.unlocked && !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (this.musicGain) this.musicGain.gain.value = this.muted ? 0 : this.musicVolume * 0.4;
    if (this.sfxGain) this.sfxGain.gain.value = this.muted ? 0 : this.sfxVolume;
  }

  /** Used by the pause manager: one call silences everything coherently. */
  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.setVolumes(this.musicVolume, this.sfxVolume);
    if (muted) this.stopMusicLoop();
    else if (this.mood !== 'none') this.startMusicLoop();
  }

  play(name: SfxName): void {
    if (!this.ready || this.muted || this.sfxVolume <= 0) return;
    const ctx = this.ctx!;
    const spec = SFX[name];
    const now = ctx.currentTime;

    if (spec.throttle) {
      const last = this.lastPlayed.get(name) ?? -1;
      if (now - last < spec.throttle) return;
      this.lastPlayed.set(name, now);
    }

    const out = ctx.createGain();
    out.gain.setValueAtTime(spec.gain, now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.cutoff ?? 8000;
    filter.connect(out);
    out.connect(this.sfxGain!);

    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f1), now + spec.duration);
    osc.connect(filter);
    osc.start(now);
    osc.stop(now + spec.duration);

    if (spec.noise && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(spec.gain * spec.noise, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
      src.connect(ng);
      ng.connect(filter);
      src.start(now);
      src.stop(now + spec.duration);
    }
  }

  setMood(mood: MusicMood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    this.stopMusicLoop();
    if (mood !== 'none' && !this.muted) this.startMusicLoop();
  }

  private startMusicLoop(): void {
    if (!this.ready || this.mood === 'none') return;
    const interval = this.mood === 'menu' ? 460 : this.mood === 'boss' ? 220 : 280;
    this.step = 0;
    this.musicTimer = setInterval(() => this.musicStep(), interval);
  }

  private stopMusicLoop(): void {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  /** One note of the loop. A short minor phrase over a pulsing root. */
  private musicStep(): void {
    if (!this.ctx || !this.musicGain || this.muted || this.musicVolume <= 0) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const s = this.step++;

    const root = this.mood === 'boss' ? 55 : this.mood === 'combat' ? 65.41 : 49;
    const bar = Math.floor(s / 8) % 4;
    const rootShift = [0, 0, -2, 3][bar];

    // Bass pulse on every other step.
    if (s % 2 === 0) {
      this.note(root * 2 ** ((rootShift) / 12), 'triangle', 0.22, 0.3, now, 420);
    }
    // Melody note from a minor scale, following a fixed contour per mood.
    const pattern = this.mood === 'menu'
      ? [0, 2, 4, 2, 1, 3, 2, 0]
      : this.mood === 'boss'
        ? [0, 1, 0, 3, 0, 4, 2, 5]
        : [0, 3, 2, 4, 0, 5, 3, 2];
    const degree = pattern[s % pattern.length];
    const semis = SCALE_MINOR[degree] + rootShift + (this.mood === 'menu' ? 12 : 24);
    this.note(root * 2 ** (semis / 12), this.mood === 'menu' ? 'triangle' : 'square',
      this.mood === 'menu' ? 0.34 : 0.16, this.mood === 'menu' ? 0.13 : 0.16, now, 2600);

    // Hi-hat-ish tick keeps combat driving.
    if (this.mood !== 'menu' && s % 2 === 1 && this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      src.connect(hp); hp.connect(g); g.connect(this.musicGain);
      src.start(now); src.stop(now + 0.05);
    }
  }

  private note(freq: number, type: OscillatorType, dur: number, gain: number, at: number, cutoff: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(f); f.connect(g); g.connect(this.musicGain!);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  destroy(): void {
    this.stopMusicLoop();
    try { void this.ctx?.close(); } catch { /* already closed */ }
    this.ctx = null;
    this.master = this.sfxGain = this.musicGain = null;
    this.unlocked = false;
  }
}

export const audio = new AudioEngine();
