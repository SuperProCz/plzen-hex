import type { LocationStatus } from "../location/tracker";
import type { GameState } from "../game/state";
import { isMuted, setMuted } from "./sfx";
import { el, fmt, medalCounts, percent } from "./statsView";
import { notificationDock } from "./dock";

export interface Goal {
  text: string;
  onClick(): void;
}

export interface StatusPanel {
  render(state: GameState): void;
  setLocation(status: LocationStatus | "outside" | "inaccurate", detail?: string): void;
  setGoal(goal: Goal | null): void;
  toast(title: string, lines?: string[]): void;
}

type PanelStatus = Parameters<StatusPanel["setLocation"]>[0];

const LOCATION_TEXT: Record<PanelStatus, string> = {
  requesting: "Čekám na povolení polohy…",
  tracking: "GPS aktivní",
  denied: "Přístup k poloze zamítnut — povolte ho v nastavení prohlížeče, jinak nejde odemykat hexagony.",
  unavailable: "Polohu se teď nedaří zjistit.",
  unsupported: "Tento prohlížeč nepodporuje určování polohy.",
  outside: "Jste mimo Plzeňský kraj.",
  inaccurate: "Signál GPS je na odemčení příliš slabý",
};

/** Colour of the GPS dot in the collapsed bar. */
const GPS_STATE: Record<PanelStatus, "ok" | "wait" | "bad" | "off"> = {
  tracking: "ok",
  requesting: "wait",
  inaccurate: "wait",
  outside: "off",
  denied: "bad",
  unavailable: "bad",
  unsupported: "bad",
};

const COLLAPSED_KEY = "plzen-hex:panel-collapsed";

function initiallyCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved !== null) return saved === "1";
  } catch {
    // Storage unavailable — fall back to the screen-size default.
  }
  return window.matchMedia("(max-width: 600px)").matches;
}

/**
 * Map panel: a slim bar (home, level + XP, GPS dot, expand) that is always visible,
 * plus details (medals, daily challenges, nearest goal, sound, GPS status) that fold away.
 * Collapsed by default on phones; the choice is remembered.
 */
export function createStatusPanel(handlers: { onRetry: () => void; onHome: () => void }): StatusPanel {
  const panel = el("div", "status-panel");

  // Bar
  const bar = el("div", "panel-bar");
  const home = el("button", "bar-icon", "🏠");
  home.type = "button";
  home.title = "Domů, odznaky a výzvy";
  home.setAttribute("aria-label", "Domů, odznaky a výzvy");
  const toggle = el("button", "bar-toggle");
  toggle.type = "button";
  const levelBadge = el("span", "bar-level");
  const barText = el("span", "bar-text");
  const barTitle = el("span", "bar-title");
  const xpTrack = el("span", "bar-xp");
  const xpFill = el("span");
  xpTrack.append(xpFill);
  barText.append(barTitle, xpTrack);
  const gpsDot = el("span", "gps-dot");
  gpsDot.dataset.state = "off";
  const chevron = el("span", "bar-chevron", "▾");
  toggle.append(levelBadge, barText, gpsDot, chevron);
  bar.append(home, toggle);

  // Details
  const details = el("div", "panel-details");
  const summary = el("div", "status-progress");
  const goal = el("button", "goal-button");
  goal.type = "button";
  goal.hidden = true;
  const location = el("div", "status-location");
  const retry = el("button", "retry-button", "Povolit polohu");
  retry.type = "button";
  retry.hidden = true;
  const sound = el("button", "sound-toggle");
  sound.type = "button";
  const renderSound = () => {
    sound.textContent = isMuted() ? "🔇 Zvuky vypnuté" : "🔊 Zvuky zapnuté";
    sound.title = isMuted() ? "Zapnout zvuky" : "Vypnout zvuky";
  };
  renderSound();
  sound.addEventListener("click", () => {
    setMuted(!isMuted());
    renderSound();
  });
  details.append(summary, goal, location, retry, sound);
  panel.append(bar, details);

  let collapsed = initiallyCollapsed();
  const setCollapsed = (value: boolean, remember = true) => {
    collapsed = value;
    panel.classList.toggle("is-collapsed", value);
    details.hidden = value;
    chevron.textContent = value ? "▾" : "▴";
    toggle.setAttribute("aria-expanded", String(!value));
    toggle.title = value ? "Zobrazit podrobnosti" : "Skrýt podrobnosti";
    if (remember) {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
      } catch {
        // Ignore.
      }
    }
  };
  setCollapsed(collapsed, false);
  toggle.addEventListener("click", () => setCollapsed(!collapsed));

  const toastEl = el("div", "toast");
  toastEl.hidden = true;
  document.body.append(panel);
  notificationDock().append(toastEl); // the toast is the dock's last (bottom) item

  retry.addEventListener("click", handlers.onRetry);
  home.addEventListener("click", handlers.onHome);
  let onGoal: (() => void) | null = null;
  goal.addEventListener("click", () => onGoal?.());
  let toastTimer: number | undefined;

  return {
    render(state) {
      levelBadge.textContent = String(state.level);
      levelBadge.title = `Úroveň ${state.level}`;
      barTitle.textContent = state.levelTitle;
      xpFill.style.width = `${percent(state.levelProgress, state.levelSpan)}%`;
      xpTrack.title = `${fmt(state.levelProgress)} / ${fmt(state.levelSpan)} XP`;

      const done = state.challenges.filter((c) => c.done).length;
      summary.replaceChildren(
        el(
          "div",
          "panel-xp",
          `Úroveň ${state.level} · ${fmt(state.xp)} XP · do další ještě ${fmt(state.levelSpan - state.levelProgress)} XP`,
        ),
        medalCounts(state.stats),
        el("div", "panel-daily", `Dnešní výzvy: ${done} / ${state.challenges.length}`),
      );
    },
    setLocation(status, detail) {
      location.textContent = detail ? `${LOCATION_TEXT[status]} (${detail})` : LOCATION_TEXT[status];
      location.dataset.status = status;
      gpsDot.dataset.state = GPS_STATE[status];
      gpsDot.title = location.textContent;
      const problem = status === "denied" || status === "unavailable";
      retry.hidden = !problem;
      // The way out of a permission problem must be visible, even on a collapsed bar.
      if (problem && collapsed) setCollapsed(false, false);
    },
    setGoal(g) {
      goal.hidden = !g;
      onGoal = g?.onClick ?? null;
      goal.textContent = g ? `🎯 ${g.text}` : "";
    },
    toast(title, lines = []) {
      toastEl.replaceChildren(el("strong", undefined, title), ...lines.map((l) => el("div", undefined, l)));
      toastEl.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => (toastEl.hidden = true), 2500 + lines.length * 1500);
    },
  };
}
