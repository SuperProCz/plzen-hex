import type { LocationStatus } from "../location/tracker";
import type { GameState } from "../game/state";
import { isMuted, setMuted } from "./sfx";
import { el, levelBlock, medalCounts } from "./statsView";
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

const LOCATION_TEXT: Record<Parameters<StatusPanel["setLocation"]>[0], string> = {
  requesting: "Čekám na povolení polohy…",
  tracking: "GPS aktivní",
  denied: "Přístup k poloze zamítnut — povolte ho v nastavení prohlížeče, jinak nejde odemykat hexagony.",
  unavailable: "Polohu se teď nedaří zjistit.",
  unsupported: "Tento prohlížeč nepodporuje určování polohy.",
  outside: "Jste mimo Plzeňský kraj.",
  inaccurate: "Signál GPS je na odemčení příliš slabý",
};

/** Compact panel over the map; everything else lives on the home screen. */
export function createStatusPanel(handlers: { onRetry: () => void; onHome: () => void }): StatusPanel {
  const panel = el("div", "status-panel");
  const summary = el("div", "status-progress");
  const goal = el("button", "goal-button");
  goal.type = "button";
  goal.hidden = true;
  const home = el("button", "home-link", "← Domů, odznaky a výzvy");
  home.type = "button";
  const location = el("div", "status-location");
  const retry = el("button", undefined, "Povolit polohu");
  retry.type = "button";
  retry.hidden = true;
  const sound = el("button", "sound-toggle");
  sound.type = "button";
  const renderSound = () => {
    sound.textContent = isMuted() ? "🔇" : "🔊";
    sound.title = isMuted() ? "Zapnout zvuky" : "Vypnout zvuky";
  };
  renderSound();
  sound.addEventListener("click", () => {
    setMuted(!isMuted());
    renderSound();
  });
  const controls = el("div", "panel-controls");
  controls.append(home, sound);
  panel.append(summary, goal, controls, location, retry);

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
      const done = state.challenges.filter((c) => c.done).length;
      const daily = el("div", "panel-daily", `Dnešní výzvy: ${done} / ${state.challenges.length}`);
      summary.replaceChildren(
        levelBlock(state.level, state.levelTitle, state.levelProgress, state.levelSpan, state.xp),
        medalCounts(state.stats),
        daily,
      );
    },
    setLocation(status, detail) {
      location.textContent = detail ? `${LOCATION_TEXT[status]} (${detail})` : LOCATION_TEXT[status];
      location.dataset.status = status;
      retry.hidden = !(status === "denied" || status === "unavailable");
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
