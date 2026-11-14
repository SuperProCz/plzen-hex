import type { Tier } from "../stats/tiers";
import { el } from "./statsView";
import { notificationDock } from "./dock";

/** Badge tiers plus the other things worth a celebration. Each kind has its own colour (see style.css). */
export type CelebrationKind = Tier | "milestone" | "level" | "challenge";

export interface Celebration {
  kind: CelebrationKind;
  kicker: string;
  title: string;
  subtitle: string;
  /** Shown on the medal; defaults to a star. */
  icon?: string;
}

const CONFETTI: Record<CelebrationKind, number> = {
  bronze: 14,
  challenge: 18,
  silver: 22,
  milestone: 28,
  gold: 36,
  level: 36,
};
const VISIBLE_MS = 5000;

let stack: HTMLElement | null = null;

function burst(card: HTMLElement, kind: CelebrationKind): void {
  const confetti = el("div", "confetti");
  for (let i = 0; i < CONFETTI[kind]; i++) {
    const piece = el("span", "confetti-piece");
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 90;
    piece.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * distance - 30}px`);
    piece.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
    piece.style.setProperty("--hue", `${Math.floor(Math.random() * 360)}`);
    piece.style.animationDelay = `${Math.random() * 80}ms`;
    confetti.append(piece);
  }
  card.append(confetti);
}

function dismiss(card: HTMLElement): void {
  if (card.classList.contains("leaving")) return;
  card.classList.add("leaving");
  // Confetti/shine animations bubble up too — only react to the card's own exit animation.
  card.addEventListener("animationend", (e) => e.target === card && card.remove());
}

/** Big celebratory cards in the corner, one per item, staggered. Click to dismiss. */
export function showCelebrations(items: Celebration[]): void {
  if (!stack) {
    stack = el("div", "badge-stack");
    notificationDock().prepend(stack); // above the unlock toast
  }
  items.forEach((c, i) => {
    window.setTimeout(() => {
      const card = el("div", "badge-card");
      card.dataset.tier = c.kind;
      card.setAttribute("role", "status");

      const medal = el("div", "badge-medal");
      medal.append(el("span", "badge-icon", c.icon ?? "★"), el("span", "badge-shine"));
      const text = el("div", "badge-text");
      text.append(el("div", "badge-kicker", c.kicker), el("div", "badge-title", c.title), el("div", "badge-tier", c.subtitle));
      card.append(medal, text);
      card.addEventListener("click", () => dismiss(card));
      stack!.prepend(card);
      burst(card, c.kind);
      window.setTimeout(() => dismiss(card), VISIBLE_MS + i * 300);
    }, i * 350);
  });
}

/** Most important kind first — decides which sound plays. */
export const CELEBRATION_RANK: CelebrationKind[] = ["level", "gold", "milestone", "silver", "challenge", "bronze"];
