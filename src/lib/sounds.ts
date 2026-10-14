/**
 * Audio manager.
 *
 * Sounds are synthesized with the Web Audio API so the app ships with zero
 * binary assets and gets sub-frame latency. If you drop real samples into
 * `public/sounds/` and list them in `public/sounds/manifest.json` the manager
 * transparently prefers those files instead (see README "Custom sounds").
 */

export type SoundName =
  | 'move'
  | 'moveOpponent'
  | 'capture'
  | 'castle'
  | 'check'
  | 'checkmate'
  | 'promote'
  | 'illegal'
  | 'gameStart'
  | 'gameWin'
  | 'gameLose'
  | 'draw'
  | 'notify'
  | 'tick'
  | 'click';

interface Overrides {
  [key: string]: string;
}

type OverrideBuffers = Map<SoundName, AudioBuffer>;

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private overrides: OverrideBuffers = new Map();
  private overrideSources: Overrides = {};
  private volume = 0.7;
  private muted = false;
  private unlocked = false;
  private manifestChecked = false;

  get isMuted() {
    return this.muted;
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.01);
    }
  }

  /** Must be called from a user gesture (click/keydown) to satisfy autoplay policies. */
  unlock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.unlocked = true;
    if (!this.manifestChecked) {
      this.manifestChecked = true;
      void this.loadOverrides();
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoiseBuffer(this.ctx);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Best-effort load of user supplied sample files. Failures are silent. */
  private async loadOverrides() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const res = await fetch('/sounds/manifest.json', { cache: 'no-store' });
      if (!res.ok) return;
      const manifest = (await res.json()) as Record<string, string>;
      this.overrideSources = manifest;
      await Promise.all(
        Object.entries(manifest).map(async ([name, path]) => {
          try {
            const file = await fetch(path);
            if (!file.ok) return;
            const arrayBuffer = await file.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuffer);
            this.overrides.set(name as SoundName, decoded);
          } catch {
            /* ignore individual failures */
          }
        }),
      );
    } catch {
      /* no manifest → synthesized sounds only */
    }
  }

  play(name: SoundName, opts: { volume?: number; detune?: number } = {}) {
    if (this.muted) return;
    const override = this.overrides.get(name);
    if (override) {
      this.playBuffer(override, opts.volume ?? 1);
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' && this.unlocked) void ctx.resume();
    const gain = opts.volume ?? 1;
    switch (name) {
      case 'move':
        this.knock(ctx, { gain: 0.9 * gain, pitch: 1 });
        break;
      case 'moveOpponent':
        this.knock(ctx, { gain: 0.78 * gain, pitch: 0.94 });
        break;
      case 'capture':
        this.knock(ctx, { gain: 1 * gain, pitch: 0.72, crunch: true });
        this.noiseBurst(ctx, { duration: 0.16, type: 'bandpass', freq: 700, q: 0.9, gain: 0.5 * gain, decay: 0.12 });
        break;
      case 'castle':
        this.knock(ctx, { gain: 0.85 * gain, pitch: 1 });
        this.schedule(0.075, () => this.knock(ctx, { gain: 0.7 * gain, pitch: 0.86 }));
        break;
      case 'promote':
        this.arpeggio(ctx, [660, 880, 1174], { gain: 0.5 * gain, dur: 0.11, type: 'triangle' });
        break;
      case 'check':
        this.tone(ctx, { freq: 1180, type: 'square', duration: 0.09, gain: 0.22 * gain, decay: 0.08 });
        this.schedule(0.1, () => this.tone(ctx, { freq: 1560, type: 'square', duration: 0.12, gain: 0.2 * gain, decay: 0.1 }));
        break;
      case 'checkmate':
        this.arpeggio(ctx, [523, 659, 784, 1046, 1318], { gain: 0.42 * gain, dur: 0.13, type: 'triangle' });
        break;
      case 'gameStart':
        this.arpeggio(ctx, [392, 523, 659], { gain: 0.4 * gain, dur: 0.12, type: 'sine' });
        break;
      case 'gameWin':
        this.arpeggio(ctx, [523, 659, 784, 1046], { gain: 0.45 * gain, dur: 0.16, type: 'triangle' });
        this.schedule(0.52, () => this.arpeggio(ctx, [1046, 1318], { gain: 0.36 * gain, dur: 0.2, type: 'triangle' }));
        break;
      case 'gameLose':
        this.arpeggio(ctx, [523, 415, 311, 233], { gain: 0.4 * gain, dur: 0.19, type: 'sine' });
        break;
      case 'draw':
        this.arpeggio(ctx, [440, 466], { gain: 0.33 * gain, dur: 0.28, type: 'sine' });
        break;
      case 'notify':
        this.tone(ctx, { freq: 880, type: 'sine', duration: 0.2, gain: 0.3 * gain, decay: 0.18 });
        this.schedule(0.05, () => this.tone(ctx, { freq: 1320, type: 'sine', duration: 0.24, gain: 0.16 * gain, decay: 0.2 }));
        break;
      case 'tick':
        this.noiseBurst(ctx, { duration: 0.02, type: 'highpass', freq: 3200, q: 0.7, gain: 0.16 * gain, decay: 0.02 });
        break;
      case 'illegal':
        this.tone(ctx, { freq: 150, type: 'sawtooth', duration: 0.16, gain: 0.24 * gain, decay: 0.14, freqEnd: 110 });
        break;
      case 'click':
        this.noiseBurst(ctx, { duration: 0.015, type: 'highpass', freq: 2600, q: 0.6, gain: 0.12 * gain, decay: 0.015 });
        break;
    }
  }

  private playBuffer(buffer: AudioBuffer, volume: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);
    source.start();
  }

  /* ------------------------------------------------------------------ */
  /*  Synth primitives                                                   */
  /* ------------------------------------------------------------------ */

  private schedule(delay: number, fn: () => void) {
    const ctx = this.ctx;
    if (!ctx) return;
    const at = ctx.currentTime + delay;
    // Keep it sample-accurate without setTimeout jitter for short offsets.
    if (delay < 0.5) {
      const ms = delay * 1000;
      window.setTimeout(fn, Math.max(0, ms - 6));
    } else {
      window.setTimeout(fn, delay * 1000);
    }
    void at;
  }

  private tone(
    ctx: AudioContext,
    o: {
      freq: number;
      type: OscillatorType;
      duration: number;
      gain: number;
      decay?: number;
      attack?: number;
      freqEnd?: number;
    },
  ) {
    if (!this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, now);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), now + o.duration);
    const attack = o.attack ?? 0.004;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (o.decay ?? o.duration));
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + o.duration + 0.02);
  }

  private noiseBurst(
    ctx: AudioContext,
    o: { duration: number; type: BiquadFilterType; freq: number; q: number; gain: number; decay: number },
  ) {
    if (!this.master || !this.noise) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.value = o.freq;
    filter.Q.value = o.q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0002, o.gain), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.01, o.decay));
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now, 0, o.duration + 0.02);
  }

  /** Wooden piece "clack": filtered noise transient + body resonance. */
  private knock(ctx: AudioContext, o: { gain: number; pitch: number; crunch?: boolean }) {
    this.noiseBurst(ctx, {
      duration: 0.05,
      type: 'bandpass',
      freq: 1500 * o.pitch,
      q: 1.4,
      gain: 0.42 * o.gain,
      decay: 0.045,
    });
    this.tone(ctx, {
      freq: 190 * o.pitch,
      type: 'sine',
      duration: 0.1,
      gain: 0.3 * o.gain,
      decay: 0.08,
      freqEnd: 120 * o.pitch,
    });
    if (o.crunch) {
      this.tone(ctx, { freq: 92 * o.pitch, type: 'triangle', duration: 0.14, gain: 0.22 * o.gain, decay: 0.12 });
    }
  }

  private arpeggio(
    ctx: AudioContext,
    freqs: number[],
    o: { gain: number; dur: number; type: OscillatorType },
  ) {
    freqs.forEach((freq, i) => {
      window.setTimeout(() => {
        this.tone(ctx, { freq, type: o.type, duration: o.dur * 2.2, gain: o.gain, decay: o.dur * 2 });
      }, i * o.dur * 1000);
    });
  }
}

export const sounds = new SoundManager();

/** Convenience used by board/game components: chooses the right move sound. */
export function playMoveSound(info: {
  capture?: boolean;
  castle?: boolean;
  check?: boolean;
  checkmate?: boolean;
  promotion?: boolean;
  ownMove: boolean;
}) {
  if (info.checkmate) {
    sounds.play('checkmate');
    return;
  }
  if (info.promotion) sounds.play('promote');
  if (info.check) sounds.play('check');
  if (info.castle) {
    sounds.play('castle');
    return;
  }
  if (info.capture) {
    sounds.play('capture');
    return;
  }
  sounds.play(info.ownMove ? 'move' : 'moveOpponent');
}
