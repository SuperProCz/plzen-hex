import type { Monuments } from "../data/monuments";
import type { Places } from "../data/places";
import type { Pois } from "../data/pois";
import type { RegionBoundary } from "../data/region";
import type { HexGrid } from "../hex/grid";
import { ringCentroid } from "../geo";
import { PLZEN_CENTER } from "../config";
import type { Journal, JournalEntry } from "./journal";
import { shiftDay } from "./time";

export interface MilestoneStatus {
  done: boolean;
  /** When it was achieved; null if done but the time is unknown (old data). */
  time: number | null;
}

export interface Milestone {
  id: string;
  icon: string;
  title: string;
  description: string;
  xp: number;
  /** A place on the map to go to, if the milestone is about one. */
  target?: [number, number];
  evaluate(journal: Journal): MilestoneStatus;
}

const NOT_DONE: MilestoneStatus = { done: false, time: null };

/** Done when the entries' running count first reaches n; time = that entry's time. */
function reachedAt(entries: JournalEntry[], n: number, count: (e: JournalEntry) => number): MilestoneStatus {
  let total = 0;
  for (const e of entries) {
    total += count(e);
    if (total >= n) return { done: true, time: e.time };
  }
  return NOT_DONE;
}

/** Earliest of several statuses (done ones only). */
function earliest(statuses: MilestoneStatus[]): MilestoneStatus {
  const done = statuses.filter((s) => s.done);
  if (!done.length) return NOT_DONE;
  const timed = done.filter((s) => s.time !== null) as { done: true; time: number }[];
  return timed.length ? { done: true, time: Math.min(...timed.map((s) => s.time)) } : { done: true, time: null };
}

/** All of several statuses; time = the last one (unknown if any is unknown). */
function all(statuses: MilestoneStatus[]): MilestoneStatus {
  if (!statuses.every((s) => s.done)) return NOT_DONE;
  return statuses.some((s) => s.time === null)
    ? { done: true, time: null }
    : { done: true, time: Math.max(...statuses.map((s) => s.time!)) };
}

const sortedDays = (journal: Journal) => [...journal.byDay.keys()].sort();
const countFound = (statId: string) => (e: JournalEntry) => e.found.filter((d) => d.stat.id === statId).length;

/** Longest run of consecutive days with an unlock reaching n; time = first unlock on the day it got there. */
function streakReached(journal: Journal, n: number): MilestoneStatus {
  let run = 0;
  let prev: string | null = null;
  for (const day of sortedDays(journal)) {
    run = prev !== null && shiftDay(prev, 1) === day ? run + 1 : 1;
    prev = day;
    if (run >= n) return { done: true, time: journal.byDay.get(day)![0].time };
  }
  return NOT_DONE;
}

export interface MilestoneContext {
  grid: HexGrid;
  region: RegionBoundary;
  monuments: Monuments;
  places: Places;
  pois: Pois;
}

export function buildMilestones({ grid, region, monuments, places, pois }: MilestoneContext): Milestone[] {
  const milestones: Milestone[] = [];

  /** A milestone for unlocking the cell at a given point. */
  const placeMilestone = (m: Omit<Milestone, "evaluate" | "target">, target: [number, number]) => {
    const cell = grid.cellAt(target[0], target[1]);
    if (!cell) return;
    milestones.push({
      ...m,
      target,
      evaluate: (j) => (j.cellTime.has(cell) ? { done: true, time: j.cellTime.get(cell)! } : NOT_DONE),
    });
  };

  // Geographic extremes: the outermost vertices of the region boundary.
  const vertices = region.features.flatMap((f) =>
    f.geometry.type === "Polygon" ? f.geometry.coordinates[0] : f.geometry.coordinates.flatMap((p) => p[0]),
  );
  const extreme = (pick: (a: number[], b: number[]) => boolean) =>
    vertices.reduce((best, v) => (pick(v, best) ? v : best)) as [number, number];
  const directions: [string, string, string, [number, number]][] = [
    ["north", "⬆️", "Nejsevernější cíp kraje", extreme((a, b) => a[1] > b[1])],
    ["south", "⬇️", "Nejjižnější cíp kraje", extreme((a, b) => a[1] < b[1])],
    ["west", "⬅️", "Nejzápadnější cíp kraje", extreme((a, b) => a[0] < b[0])],
    ["east", "➡️", "Nejvýchodnější cíp kraje", extreme((a, b) => a[0] > b[0])],
  ];
  for (const [id, icon, title, target] of directions) {
    placeMilestone({ id: `extreme-${id}`, icon, title, description: "Odemkni hexagon s krajním bodem kraje.", xp: 150 }, target);
  }
  const extremeIds = directions.map(([id]) => `extreme-${id}`);
  milestones.push({
    id: "all-directions",
    icon: "🧭",
    title: "Všechny světové strany",
    description: "Navštiv nejsevernější, nejjižnější, nejzápadnější i nejvýchodnější cíp kraje.",
    xp: 300,
    evaluate: (j) => all(milestones.filter((m) => extremeIds.includes(m.id)).map((m) => m.evaluate(j))),
  });

  // Centre of the region: centroid of its largest polygon.
  const rings = region.features.flatMap((f) =>
    f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]),
  );
  const largest = rings.reduce((a, b) => (b.length > a.length ? b : a));
  placeMilestone(
    { id: "centre", icon: "🎯", title: "Střed kraje", description: "Odemkni hexagon s geografickým středem kraje.", xp: 100 },
    ringCentroid(largest),
  );

  placeMilestone(
    { id: "plzen", icon: "⛪", title: "Srdce Plzně", description: "Postav se na náměstí Republiky v Plzni.", xp: 50 },
    PLZEN_CENTER as [number, number],
  );

  const highest = pois.features
    .filter((f) => f.properties.kind === "vrchol" && f.properties.ele !== null)
    .sort((a, b) => b.properties.ele! - a.properties.ele!)[0];
  if (highest) {
    placeMilestone(
      {
        id: "highest-peak",
        icon: "🏔️",
        title: "Střecha kraje",
        description: `Vystoupej na nejvyšší vrchol kraje: ${highest.properties.name} (${highest.properties.ele} m).`,
        xp: 200,
      },
      highest.geometry.coordinates as [number, number],
    );
  }

  const brewery = monuments.features.find((f) => /Prazdroj/.test(f.properties.name));
  if (brewery) {
    placeMilestone(
      { id: "brewery", icon: "🍺", title: "Pivní pouť", description: "Navštiv pivovar Plzeňský Prazdroj.", xp: 75 },
      brewery.geometry.coordinates as [number, number],
    );
  }

  // Progress milestones.
  milestones.push(
    {
      id: "first-step",
      icon: "👣",
      title: "První krok",
      description: "Odemkni svůj první hexagon.",
      xp: 25,
      evaluate: (j) => reachedAt(j.entries, 1, () => 1),
    },
    {
      id: "hexes-10",
      icon: "🔟",
      title: "Desítka",
      description: "Odemkni 10 hexagonů.",
      xp: 50,
      evaluate: (j) => reachedAt(j.entries, 10, () => 1),
    },
    {
      id: "hexes-100",
      icon: "💯",
      title: "Stovka",
      description: "Odemkni 100 hexagonů.",
      xp: 300,
      evaluate: (j) => reachedAt(j.entries, 100, () => 1),
    },
    {
      id: "first-nkp",
      icon: "🏛️",
      title: "Národní poklad",
      description: "Objev svou první národní kulturní památku.",
      xp: 50,
      evaluate: (j) => reachedAt(j.entries, 1, countFound("nkp")),
    },
  );

  // A municipality with at least 3 parts, every one of them visited.
  const partCells = new Map<number, Set<string>>();
  for (const f of places.features) {
    const cell = grid.cellAt(f.geometry.coordinates[0], f.geometry.coordinates[1]);
    if (!cell) continue;
    const cells = partCells.get(f.properties.municipalityId) ?? new Set();
    cells.add(cell);
    partCells.set(f.properties.municipalityId, cells);
  }
  const partCount = new Map<number, number>();
  for (const f of places.features) {
    partCount.set(f.properties.municipalityId, (partCount.get(f.properties.municipalityId) ?? 0) + 1);
  }
  milestones.push({
    id: "complete-municipality",
    icon: "🏘️",
    title: "Za humny",
    description: "Navštiv všechny vesnice a části jedné obce, která jich má aspoň 3.",
    xp: 100,
    evaluate: (j) =>
      earliest(
        [...partCells]
          .filter(([id]) => (partCount.get(id) ?? 0) >= 3)
          .map(([, cells]) =>
            all([...cells].map((c) => (j.cellTime.has(c) ? { done: true, time: j.cellTime.get(c)! } : NOT_DONE))),
          ),
      ),
  });

  // Daily feats.
  const perDay = (n: number, count: (e: JournalEntry) => number) => (j: Journal) =>
    earliest(sortedDays(j).map((d) => reachedAt(j.byDay.get(d)!, n, count)));
  milestones.push(
    {
      id: "day-5",
      icon: "🥾",
      title: "Den na cestách",
      description: "Odemkni 5 hexagonů za jediný den.",
      xp: 75,
      evaluate: perDay(5, () => 1),
    },
    {
      id: "day-15",
      icon: "🏃",
      title: "Maratonec",
      description: "Odemkni 15 hexagonů za jediný den.",
      xp: 200,
      evaluate: perDay(15, () => 1),
    },
    {
      id: "castle-trio",
      icon: "🏰",
      title: "Hradní trojboj",
      description: "Objev 3 hrady nebo zříceniny za jediný den.",
      xp: 150,
      evaluate: perDay(3, countFound("monuments-hrad")),
    },
  );

  // Time of day and week.
  const firstAt = (pred: (d: Date) => boolean) => (j: Journal) => {
    const e = j.timed().find((x) => pred(new Date(x.time)));
    return e ? { done: true, time: e.time } : NOT_DONE;
  };
  milestones.push(
    {
      id: "early-bird",
      icon: "🌅",
      title: "Ranní ptáče",
      description: "Odemkni hexagon mezi 4. a 7. hodinou ráno.",
      xp: 50,
      evaluate: firstAt((d) => d.getHours() >= 4 && d.getHours() < 7),
    },
    {
      id: "night-owl",
      icon: "🦉",
      title: "Noční sova",
      description: "Odemkni hexagon mezi 22. hodinou a 4. hodinou ráno.",
      xp: 50,
      evaluate: firstAt((d) => d.getHours() >= 22 || d.getHours() < 4),
    },
    {
      id: "weekend",
      icon: "🎒",
      title: "Víkendový výletník",
      description: "Odemkni hexagon v sobotu i v neděli téhož víkendu.",
      xp: 75,
      evaluate: (j) =>
        earliest(
          sortedDays(j)
            .filter((d) => new Date(`${d}T12:00`).getDay() === 6 && j.byDay.has(shiftDay(d, 1)))
            .map((d) => ({ done: true, time: j.byDay.get(shiftDay(d, 1))![0].time })),
        ),
    },
  );

  // Streaks.
  milestones.push(
    {
      id: "streak-3",
      icon: "🔥",
      title: "Tři dny v řadě",
      description: "Odemykej hexagony 3 dny po sobě.",
      xp: 75,
      evaluate: (j) => streakReached(j, 3),
    },
    {
      id: "streak-7",
      icon: "📅",
      title: "Týden v pohybu",
      description: "Odemykej hexagony 7 dní po sobě.",
      xp: 200,
      evaluate: (j) => streakReached(j, 7),
    },
    {
      id: "streak-30",
      icon: "🏆",
      title: "Měsíc na cestách",
      description: "Odemykej hexagony 30 dní po sobě.",
      xp: 600,
      evaluate: (j) => streakReached(j, 30),
    },
  );

  return milestones;
}
