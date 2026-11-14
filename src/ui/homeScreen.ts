import type { GameState } from "../game/state";
import type { StatGroup, StatSummary } from "../stats/progress";
import { formatDate, formatDateTime, plural } from "../game/time";
import { el, GROUP_TITLES, levelBlock, medalCounts, percent, statRow } from "./statsView";

/** One trip-journal line, prepared by the caller. */
export interface JournalItem {
  time: number | null;
  place: string;
  found: string[];
}

export interface HomeHandlers {
  onStart(): void;
  onShowOnMap(target: [number, number]): void;
  onReset(): void;
  /** Anonymous visit statistics opt-out. */
  analytics: { available: boolean; isEnabled(): boolean; setEnabled(on: boolean): void };
}

export interface HomeScreen {
  show(): void;
  hide(): void;
  render(state: GameState, journal: JournalItem[]): void;
  showError(message: string): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

// The trail: a cubic Bézier from the bottom-left foreground up into the hills (viewBox 0 0 400 200).
const TRAIL: [number, number][] = [
  [-10, 205],
  [120, 150],
  [190, 185],
  [330, 112],
];
const STEPS = 12;
const STEP_SECONDS = 0.38;

function bezier(t: number): { x: number; y: number; angle: number } {
  const [p0, p1, p2, p3] = TRAIL;
  const u = 1 - t;
  const at = (i: 0 | 1) => u ** 3 * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t ** 3 * p3[i];
  const d = (i: 0 | 1) =>
    3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
  return { x: at(0), y: at(1), angle: (Math.atan2(d(1), d(0)) * 180) / Math.PI };
}

/** A boot print pointing "up" (−y), centred on 0,0. */
function bootPrint(): SVGGElement {
  const g = svg("g", { class: "footprint-shape" });
  g.append(
    svg("ellipse", { cx: 0, cy: -2.2, rx: 2.7, ry: 4.2 }),
    svg("ellipse", { cx: 0, cy: 4.6, rx: 2.1, ry: 2.3 }),
  );
  return g;
}

function cloud(className: string): SVGSVGElement {
  const c = svg("svg", { class: `scene-cloud ${className}`, viewBox: "-28 -14 56 30", "aria-hidden": "true" });
  c.append(
    svg("ellipse", { cx: 0, cy: 6, rx: 26, ry: 8 }),
    svg("ellipse", { cx: -8, cy: 0, rx: 12, ry: 10 }),
    svg("ellipse", { cx: 9, cy: -2, rx: 14, ry: 12 }),
  );
  return c;
}

/** Full-screen backdrop: sky with sun and drifting clouds, hills with the trail along the bottom. */
function hikingBackdrop(): HTMLElement {
  const bg = el("div", "home-bg");
  bg.setAttribute("aria-hidden", "true");
  bg.append(el("div", "scene-sun"), cloud("cloud-1"), cloud("cloud-2"), cloud("cloud-3"), hillsScene());
  return bg;
}

/** Hills, a few trees and footprints walking up a trail. Cropped to the hills (y ≥ 65). */
function hillsScene(): SVGSVGElement {
  const scene = svg("svg", {
    class: "home-scene",
    viewBox: "0 65 400 135",
    preserveAspectRatio: "xMidYMax slice",
  });

  scene.append(
    svg("path", { class: "hill hill-far", d: "M0 120 Q70 70 150 105 T300 85 T400 95 V200 H0Z" }),
    svg("path", { class: "hill hill-mid", d: "M0 150 Q90 105 190 135 T400 115 V200 H0Z" }),
  );

  // Little pine trees on the middle hill.
  for (const [x, y, s] of [
    [40, 128, 1],
    [52, 126, 0.8],
    [262, 118, 0.9],
    [276, 121, 1.1],
    [360, 112, 0.8],
  ]) {
    const tree = svg("g", { class: "scene-tree", transform: `translate(${x} ${y}) scale(${s})` });
    tree.append(svg("rect", { x: -0.8, y: 0, width: 1.6, height: 4 }), svg("path", { d: "M0 -14 L6 1 H-6Z" }));
    scene.append(tree);
  }

  scene.append(svg("path", { class: "hill hill-near", d: "M0 175 Q110 130 230 160 T400 140 V200 H0Z" }));

  const [p0, p1, p2, p3] = TRAIL;
  scene.append(
    svg("path", {
      class: "scene-trail",
      d: `M${p0} C${p1} ${p2} ${p3}`,
    }),
  );

  // Footprints alternate left/right of the trail and get smaller with distance.
  const cycle = STEPS * STEP_SECONDS + 1.6;
  for (let i = 0; i < STEPS; i++) {
    const t = 0.08 + (i / (STEPS - 1)) * 0.84;
    const { x, y, angle } = bezier(t);
    const side = i % 2 ? 1 : -1;
    const rad = ((angle + 90) * Math.PI) / 180;
    const scale = 1.25 - t * 0.7;
    const offset = 4.5 * scale * side;
    const pos = svg("g", {
      transform: `translate(${x + Math.cos(rad) * offset} ${y + Math.sin(rad) * offset}) rotate(${angle + 90}) scale(${scale})`,
    });
    const print = bootPrint();
    print.style.animationDuration = `${cycle}s`;
    print.style.animationDelay = `${i * STEP_SECONDS}s`;
    pos.append(print);
    scene.append(pos);
  }

  return scene;
}

const HOW_TO_PLAY = [
  "Klepni na „Začít výlet“ a povol přístup k poloze.",
  "Kraj je rozdělený na hexagony; kde je hodně památek, dělí se na menší trojúhelníky.",
  "Dojdi do hexagonu — jakmile tě v něm GPS zachytí (přesnost do 150 m), odemkne se.",
  "Odemčením objevíš vše, co v něm leží: obce, vesnice, památky, rozhledny i vrcholy.",
  "Za objevy sbíráš XP a zvyšuješ si úroveň. Odznaky mají bronz (10 %), stříbro (50 %) a zlato (100 %).",
  "Plň denní výzvy, drž sérii dní v řadě a hledej milníky — třeba nejjižnější cíp kraje.",
];


const SOURCES =
  "Data: © přispěvatelé OpenStreetMap (ODbL) · Národní památkový ústav — Ústřední seznam kulturních památek (CC BY 4.0) · ČÚZK RÚIAN (CC BY 4.0). Postup se ukládá jen v tomto zařízení; kraji se (pokud to nevypneš) posílá jen anonymní počet návštěv jednotlivých hexagonů.";

function card(className: string, title?: string): HTMLElement {
  const section = el("section", `home-card ${className}`);
  if (title) section.append(el("h2", undefined, title));
  return section;
}

export function createHomeScreen(handlers: HomeHandlers): HomeScreen {
  const root = el("div", "home");
  const title = el("header", "home-title");
  title.append(el("h1", undefined, "Plzeň Hex"), el("p", undefined, "Objevuj Plzeňský kraj krok za krokem"));

  const body = el("main", "home-body");
  const start = el("button", "start-button", "Načítám…");
  start.type = "button";
  start.disabled = true;
  const error = el("div", "home-error");
  error.hidden = true;
  const content = el("div", "home-content");
  body.append(title, start, error, content);
  root.append(hikingBackdrop(), body);
  document.body.append(root);

  let started = false;
  start.addEventListener("click", () => {
    started = true;
    handlers.onStart();
  });
  const startLabel = () => (started ? "Pokračovat ve výletu" : "Začít výlet");

  function playerCard(state: GameState): HTMLElement {
    const c = card("player-card");
    const explored = state.stats[0];
    const chips = el("div", "player-chips");
    const streak = el(
      "span",
      `chip streak-chip${state.streak ? "" : " is-empty"}`,
      state.streak
        ? `🔥 ${state.streak} ${plural(state.streak, "den", "dny", "dní")} v řadě${state.playedToday ? "" : " — dnes ještě nic!"}`
        : "🔥 Začni sérii dní v řadě",
    );
    const pct = percent(explored.visited, explored.total).toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
    chips.append(streak, el("span", "chip", `🗺️ ${pct} % kraje`), medalCounts(state.stats));
    c.append(levelBlock(state.level, state.levelTitle, state.levelProgress, state.levelSpan, state.xp), chips);
    return c;
  }

  function challengesCard(state: GameState): HTMLElement {
    const c = card("challenges-card", "Dnešní výzvy");
    const list = el("ul", "challenge-list");
    for (const { challenge, progress, done } of state.challenges) {
      const item = el("li", `challenge${done ? " is-done" : ""}`);
      const check = el("span", "challenge-check", done ? "✓" : "");
      const text = el("div", "challenge-text");
      text.append(
        el("span", undefined, challenge.text),
        el("span", "challenge-meta", done ? `Splněno · +${challenge.xp} XP` : `${progress} / ${challenge.target} · +${challenge.xp} XP`),
      );
      item.append(check, text);
      list.append(item);
    }
    c.append(list, el("p", "card-note", "Nové výzvy každý den o půlnoci."));
    return c;
  }

  function milestonesCard(state: GameState): HTMLElement {
    const done = state.milestones.filter((m) => m.status.done).length;
    const c = card("milestones-card", `Milníky · ${done} / ${state.milestones.length}`);
    const grid = el("div", "milestone-grid");
    for (const { milestone, status } of state.milestones) {
      const item = el("div", `milestone${status.done ? " is-done" : ""}`);
      const text = el("div", "milestone-text");
      text.append(
        el("strong", undefined, milestone.title),
        el("span", undefined, milestone.description),
        el(
          "span",
          "milestone-meta",
          status.done ? `Splněno${status.time ? ` ${formatDate(status.time)}` : ""} · +${milestone.xp} XP` : `+${milestone.xp} XP`,
        ),
      );
      if (milestone.target && !status.done) {
        const go = el("button", "milestone-go", "Ukázat na mapě");
        go.type = "button";
        go.addEventListener("click", () => handlers.onShowOnMap(milestone.target!));
        text.append(go);
      }
      item.append(el("span", "milestone-icon", milestone.icon), text);
      grid.append(item);
    }
    c.append(grid);
    return c;
  }

  function achievementSections(stats: StatSummary[]): HTMLElement[] {
    const byGroup = new Map<StatGroup, StatSummary[]>();
    for (const s of stats.slice(1)) byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
    return [...byGroup].map(([group, items]) => {
      const section = el("section", "home-group");
      section.append(el("h2", undefined, `Odznaky · ${GROUP_TITLES[group] ?? ""}`));
      const grid = el("div", "achievement-grid");
      for (const s of items) {
        const achievement = el("div", "achievement-card");
        const row = statRow(s);
        achievement.dataset.tier = row.dataset.tier;
        achievement.append(row);
        grid.append(achievement);
      }
      section.append(grid);
      return section;
    });
  }

  function journalCard(journal: JournalItem[]): HTMLElement {
    const c = card("journal-card", "Cestovní deník");
    if (!journal.length) {
      c.append(el("p", "card-note", "Zatím prázdný. Vyraz na výlet a první objevy se zapíšou sem."));
      return c;
    }
    const list = el("ol", "journal-list");
    for (const entry of journal) {
      const item = el("li");
      const head = el("div", "journal-head");
      head.append(
        el("strong", undefined, entry.place),
        el("span", "journal-time", entry.time ? formatDateTime(entry.time) : "dříve"),
      );
      item.append(head);
      if (entry.found.length) {
        const shown = entry.found.slice(0, 6).join(" · ");
        const more = entry.found.length > 6 ? ` a ${entry.found.length - 6} dalších` : "";
        item.append(el("div", "journal-found", shown + more));
      }
      list.append(item);
    }
    c.append(list);
    return c;
  }

  function howToCard(): HTMLElement {
    const details = el("details", "home-card howto-card");
    details.append(el("summary", undefined, "Jak hrát"));
    const list = el("ol");
    for (const step of HOW_TO_PLAY) list.append(el("li", undefined, step));
    details.append(list);
    return details;
  }

  function analyticsToggle(): HTMLElement {
    const label = el("label", "analytics-toggle");
    const box = el("input");
    box.type = "checkbox";
    box.checked = handlers.analytics.isEnabled();
    box.addEventListener("change", () => handlers.analytics.setEnabled(box.checked));
    label.append(
      box,
      el(
        "span",
        undefined,
        "Pomáhat kraji anonymními statistikami — odesílá se jen, kolikrát byl který hexagon navštíven. Žádná poloha, čas ani identita.",
      ),
    );
    return label;
  }

  function footer(): HTMLElement {
    const f = el("footer", "home-footer");
    if (handlers.analytics.available) f.append(analyticsToggle());
    const reset = el("button", "reset-button", "Smazat postup");
    reset.type = "button";
    let armed: number | undefined;
    reset.addEventListener("click", () => {
      if (armed) {
        clearTimeout(armed);
        handlers.onReset();
        return;
      }
      reset.textContent = "Opravdu smazat vše? Klikni znovu";
      reset.classList.add("is-armed");
      armed = window.setTimeout(() => {
        armed = undefined;
        reset.textContent = "Smazat postup";
        reset.classList.remove("is-armed");
      }, 4000);
    });
    f.append(el("p", undefined, SOURCES), reset);
    return f;
  }

  return {
    show() {
      if (!start.disabled) start.textContent = startLabel();
      root.hidden = false;
      root.scrollTop = 0;
      requestAnimationFrame(() => root.classList.remove("leaving"));
    },
    hide() {
      root.classList.add("leaving");
      window.setTimeout(() => (root.hidden = true), 350);
    },
    render(state, journal) {
      start.disabled = false;
      start.textContent = startLabel();
      content.replaceChildren(
        playerCard(state),
        challengesCard(state),
        milestonesCard(state),
        ...achievementSections(state.stats),
        journalCard(journal),
        howToCard(),
        footer(),
      );
    },
    showError(message) {
      error.textContent = message;
      error.hidden = false;
      start.textContent = "Nelze spustit";
    },
  };
}
