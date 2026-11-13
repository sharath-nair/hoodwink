/**
 * Synthesized sound effects (WebAudio). No audio assets to load, ship or license.
 *
 * - The AudioContext is created lazily and resumed on the first user gesture (`unlock`),
 *   which is what iOS Safari / Chrome autoplay policies require.
 * - Nothing plays while the tab is hidden (a backgrounded phone shouldn't tick or fanfare).
 * - Mute state persists in localStorage and is observable via `subscribeMuted` for React.
 */

interface Tone {
  freq: number;
  /** seconds after the sound starts */
  at?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** glide to this frequency over the tone's duration */
  to?: number;
}

const MUTE_KEY = 'hoodwink:muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Call from a user gesture (pointerdown/keydown) to satisfy autoplay policies. */
export function unlock(): void {
  const c = ensure();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable: mute still applies for this session */
  }
  listeners.forEach((l) => l());
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function play(tones: Tone[]): void {
  if (muted || (typeof document !== 'undefined' && document.hidden)) return;
  const c = ensure();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume().catch(() => {});
  const base = c.currentTime;
  for (const t of tones) {
    const start = base + (t.at ?? 0);
    const end = start + t.dur;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, end);
    // Fast attack, exponential decay: avoids clicks and sounds "plucky".
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(t.gain ?? 0.4, start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

export const sfx = {
  /** UI button press. */
  click: () => play([{ freq: 520, to: 420, dur: 0.06, type: 'triangle', gain: 0.35 }]),

  /** Server confirmed our answer / vote was locked in. */
  lock: () =>
    play([
      { freq: 523, dur: 0.1, type: 'triangle' },
      { freq: 784, at: 0.08, dur: 0.16, type: 'triangle' },
    ]),

  /** Countdown tick; `urgent` for the final two seconds. */
  tick: (urgent = false) => play([{ freq: urgent ? 1180 : 880, dur: 0.05, type: 'square', gain: urgent ? 0.22 : 0.14 }]),

  /** New phase begins. */
  whoosh: () => play([{ freq: 300, to: 900, dur: 0.22, type: 'sine', gain: 0.25 }]),

  /** Reveal card flips over a fake answer. */
  flipFake: () =>
    play([
      { freq: 260, to: 620, dur: 0.18, type: 'sawtooth', gain: 0.14 },
      { freq: 120, at: 0.12, dur: 0.12, type: 'sine', gain: 0.35 },
    ]),

  /** Reveal card flips over the real answer. */
  flipTruth: () =>
    play([
      { freq: 784, dur: 0.18, type: 'triangle' },
      { freq: 988, at: 0.1, dur: 0.18, type: 'triangle' },
      { freq: 1319, at: 0.2, dur: 0.45, type: 'triangle' },
    ]),

  error: () =>
    play([
      { freq: 170, dur: 0.12, type: 'sawtooth', gain: 0.25 },
      { freq: 140, at: 0.13, dur: 0.16, type: 'sawtooth', gain: 0.25 },
    ]),

  /** Scoreboard stinger. */
  scoreboard: () =>
    play([
      { freq: 523, dur: 0.14, type: 'triangle' },
      { freq: 659, at: 0.1, dur: 0.14, type: 'triangle' },
      { freq: 784, at: 0.2, dur: 0.3, type: 'triangle' },
    ]),

  /** Game over fanfare. */
  fanfare: () =>
    play([
      { freq: 523, dur: 0.16, type: 'triangle' },
      { freq: 523, at: 0.16, dur: 0.16, type: 'triangle' },
      { freq: 523, at: 0.32, dur: 0.16, type: 'triangle' },
      { freq: 698, at: 0.48, dur: 0.4, type: 'triangle' },
      { freq: 587, at: 0.88, dur: 0.16, type: 'triangle' },
      { freq: 698, at: 1.04, dur: 0.16, type: 'triangle' },
      // final chord
      { freq: 523, at: 1.24, dur: 1.0, type: 'sawtooth', gain: 0.12 },
      { freq: 659, at: 1.24, dur: 1.0, type: 'sawtooth', gain: 0.12 },
      { freq: 784, at: 1.24, dur: 1.0, type: 'sawtooth', gain: 0.12 },
      { freq: 1047, at: 1.24, dur: 1.0, type: 'triangle', gain: 0.3 },
    ]),
};
