import type { Tier } from "../stats/tiers";
import type { CelebrationKind } from "./celebrations";

// Sounds are synthesised with Web Audio: no audio files to load or license.

const MUTE_KEY = "plzen-hex:muted";
let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // Storage unavailable — default to sound on.
}

let interacted = false;

/**
 * Browsers only allow audio after the user has interacted with the page, and suspend it again
 * when the tab is hidden or the phone locks (iOS: "interrupted"). So we create the context on the
 * first tap/key press, re-wake it on every later one and whenever the tab becomes visible again,
 * and each sound also tries to resume it before playing (see withAudio).
 */
export function initSfx(): void {
  const wake = () => {
    interacted = true;
    ctx ??= new AudioContext();
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
  };
  for (const type of ["pointerdown", "touchend", "keydown"])
    window.addEventListener(type, wake, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && interacted) wake();
  });
}

export const isMuted = () => muted;

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    // Ignore.
  }
}

function note(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "triangle",
  volume = 0.18,
) {
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** Plays once the audio context is running; gives up if it can't be resumed quickly (e.g. tab hidden). */
function withAudio(play: () => void): void {
  if (muted || !interacted) return;
  ctx ??= new AudioContext();
  if (ctx.state === "running") return play();
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000));
  Promise.race([ctx.resume(), timeout]).then(
    () => ctx?.state === "running" && play(),
    () => {},
  );
}

/** Short two-note "pop" for a newly unlocked hexagon. */
export function playUnlock(): void {
  withAudio(() => {
    note(660, 0, 0.12, "sine", 0.15);
    note(990, 0.07, 0.2, "sine", 0.15);
  });
}

// Rising major arpeggios (C major), longer and brighter for higher tiers.
const FANFARES: Record<Tier, number[]> = {
  bronze: [523.25, 659.25, 783.99],
  silver: [523.25, 659.25, 783.99, 1046.5],
  gold: [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98],
};

export function playBadge(tier: Tier): void {
  withAudio(() => {
    const notes = FANFARES[tier];
    notes.forEach((f, i) => note(f, i * 0.08, 0.35, "triangle", 0.16));
    const end = notes.length * 0.08;
    // Final chord.
    for (const f of notes.slice(-3)) note(f, end, 0.9, "triangle", 0.1);
    // Gold gets a sparkly shimmer on top.
    if (tier === "gold")
      for (let i = 0; i < 8; i++) note(2093 + (i % 2) * 547, end + 0.1 + i * 0.06, 0.15, "sine", 0.05);
  });
}

/** Fanfare matching a celebration: level-ups sound like gold, milestones like silver, challenges like bronze. */
export function playCelebration(kind: CelebrationKind): void {
  const tier: Record<CelebrationKind, Tier> = {
    level: "gold",
    gold: "gold",
    milestone: "silver",
    silver: "silver",
    challenge: "bronze",
    bronze: "bronze",
  };
  playBadge(tier[kind]);
}
