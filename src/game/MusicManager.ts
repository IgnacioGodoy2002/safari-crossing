/**
 * Procedurally generated, seamlessly looping background music.
 * No audio assets — everything is synthesized with the Web Audio API so the
 * loop can run indefinitely while staying light on bandwidth.
 *
 * The 8-bar sequence stays in one key/tempo the whole time (so it always
 * feels like the same song), but the melody and percussion picks a new
 * variation bank every pass through the loop, which keeps it from sounding
 * like a robotic 2-second repeat.
 */

const BPM = 132;
const BEAT = 60 / BPM;
const STEP = BEAT / 4; // 16th notes
const STEPS_PER_BAR = 16;
const BARS_PER_LOOP = 8;

// E minor pentatonic-ish scale, tuned for a bright "safari adventure" feel.
const ROOT = 164.81; // E3
const SCALE = [0, 3, 5, 7, 10, 12, 15, 19]; // semitone offsets (min pentatonic + octave color)

function noteFreq(scaleIndex: number, octave = 0): number {
  const semis = SCALE[((scaleIndex % SCALE.length) + SCALE.length) % SCALE.length] + octave * 12;
  return ROOT * Math.pow(2, semis / 12);
}

// A handful of 16-step melody patterns (scale indices, -1 = rest) to rotate between loops.
const MELODY_BANKS: number[][] = [
  [0, -1, 2, -1, 4, -1, 3, -1, 5, -1, 4, -1, 2, -1, 0, -1],
  [4, -1, 5, 4, 2, -1, 0, -1, 2, 3, 4, -1, 3, -1, 2, -1],
  [0, 2, -1, 4, -1, 5, 7, -1, 5, -1, 4, 2, -1, 0, -1, -1],
  [7, -1, 5, -1, 4, -1, 5, 4, 2, -1, 4, -1, 2, 0, -1, -1],
];

// Simple bassline walking the root/fifth, one entry per beat (4 beats/bar).
const BASS_PATTERN = [0, 0, 4, 3];

export class MusicManager {
  private static ctx: AudioContext | null = null;
  private static master: GainNode | null = null;
  private static musicGain: GainNode | null = null;
  private static filter: BiquadFilterNode | null = null;

  private static timerId: number | null = null;
  private static nextNoteTime = 0;
  private static currentStep = 0;
  private static currentBar = 0;
  private static currentBank = 0;
  private static muted = false;

  private static readonly LOOKAHEAD_MS = 25;
  private static readonly SCHEDULE_AHEAD = 0.12;

  static isMuted(): boolean {
    return this.muted;
  }

  static setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  static start(): void {
    if (this.timerId !== null) return; // already running

    const ctx = this.getCtx();
    if (ctx.state === "suspended") void ctx.resume();

    this.master = this.master ?? ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 2200;
    this.filter.connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.muted ? 0 : 0.5;
    this.musicGain.connect(this.filter);

    this.currentStep = 0;
    this.currentBar = 0;
    this.currentBank = 0;
    this.nextNoteTime = ctx.currentTime + 0.05;

    this.timerId = window.setInterval(() => this.scheduler(), this.LOOKAHEAD_MS);
  }

  static stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private static getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  private static scheduler(): void {
    const ctx = this.ctx!;
    while (this.nextNoteTime < ctx.currentTime + this.SCHEDULE_AHEAD) {
      this.scheduleStep(this.currentStep, this.currentBar, this.nextNoteTime);
      this.advance();
    }
  }

  private static advance(): void {
    this.nextNoteTime += STEP;
    this.currentStep++;
    if (this.currentStep >= STEPS_PER_BAR) {
      this.currentStep = 0;
      this.currentBar++;
      if (this.currentBar >= BARS_PER_LOOP) {
        this.currentBar = 0;
        // Rotate to a different melody bank each time the loop repeats,
        // so the tune stays recognizable but never feels mechanically identical.
        this.currentBank = (this.currentBank + 1 + Math.floor(Math.random() * (MELODY_BANKS.length - 1))) % MELODY_BANKS.length;
      }
    }
  }

  private static scheduleStep(step: number, bar: number, time: number): void {
    // Percussion: four-on-the-floor kick + offbeat shaker, with a light fill
    // on the last bar of every 4-bar phrase to keep the loop point interesting.
    if (step % 4 === 0) this.playKick(time);
    if (step % 4 === 2) this.playHat(time, 0.5);
    if (step % 2 === 1) this.playHat(time, 0.22);

    const isFillBar = bar === BARS_PER_LOOP - 1;
    if (isFillBar && step >= 12) this.playHat(time, 0.35);

    // Bass on quarter notes.
    if (step % 4 === 0) {
      const beatIdx = Math.floor(step / 4) + (bar % 2 === 1 ? 2 : 0);
      const degree = BASS_PATTERN[beatIdx % BASS_PATTERN.length];
      this.playBass(noteFreq(degree, -1), time);
    }

    // Melody: pick from the current bank on odd bars, a lightly shifted
    // variant on even bars so back-to-back bars don't sound copy-pasted.
    const bank = MELODY_BANKS[(this.currentBank + (bar % MELODY_BANKS.length)) % MELODY_BANKS.length];
    const degree = bank[step];
    if (degree >= 0) {
      const octave = bar % 4 === 3 ? 1 : 0; // lift the melody an octave once per phrase
      this.playPluck(noteFreq(degree, octave), time, step % 8 === 0 ? 0.22 : 0.16);
    }
  }

  private static playKick(time: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(this.musicGain!);
    o.type = "sine";
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    o.start(time); o.stop(time + 0.16);
  }

  private static playHat(time: number, vol: number): void {
    const ctx = this.ctx!;
    const bufferSize = ctx.sampleRate * 0.05;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.5, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.045);

    src.connect(hp); hp.connect(g); g.connect(this.musicGain!);
    src.start(time); src.stop(time + 0.05);
  }

  private static playBass(freq: number, time: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(this.musicGain!);
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(0.55, time + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, time + BEAT * 0.9);
    o.start(time); o.stop(time + BEAT);
  }

  private static playPluck(freq: number, time: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(this.musicGain!);
    o.type = "square";
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.001, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + STEP * 1.8);
    o.start(time); o.stop(time + STEP * 2);
  }
}
