import type { Journal, JournalEntry } from "./journal";
import { dayKey } from "./time";

export interface Challenge {
  id: string;
  text: string;
  xp: number;
  target: number;
  /** Progress contributed by one unlock. */
  count(entry: JournalEntry): number;
}

export interface ChallengeStatus {
  challenge: Challenge;
  progress: number;
  done: boolean;
}

const found =
  (...statIds: string[]) =>
  (e: JournalEntry) =>
    e.found.filter((d) => statIds.includes(d.stat.id)).length;

const HEX_CHALLENGES: Challenge[] = [
  { id: "hexes-1", text: "Odemkni 1 nový hexagon", xp: 30, target: 1, count: () => 1 },
  { id: "hexes-2", text: "Odemkni 2 nové hexagony", xp: 50, target: 2, count: () => 1 },
  { id: "hexes-3", text: "Odemkni 3 nové hexagony", xp: 70, target: 3, count: () => 1 },
];

const OTHER_CHALLENGES: Challenge[] = [
  { id: "monuments-2", text: "Objev 2 nové památky", xp: 50, target: 2, count: found("monuments") },
  {
    id: "municipality",
    text: "Navštiv novou obec, městys nebo město",
    xp: 50,
    target: 1,
    count: found("municipality-mesto", "municipality-mestys", "municipality-obec"),
  },
  { id: "villages-2", text: "Navštiv 2 nové vesnice nebo místní části", xp: 40, target: 2, count: found("villages") },
  { id: "peak", text: "Zdolej nový vrchol", xp: 50, target: 1, count: found("pois-vrchol") },
  { id: "tower", text: "Navštiv novou rozhlednu", xp: 100, target: 1, count: found("pois-rozhledna") },
  { id: "church", text: "Objev nový kostel", xp: 50, target: 1, count: found("monuments-kostel") },
  { id: "chapel", text: "Objev novou kapli", xp: 40, target: 1, count: found("monuments-kaple") },
  { id: "chateau", text: "Objev nový zámek", xp: 80, target: 1, count: found("monuments-zamek") },
  { id: "castle", text: "Objev nový hrad nebo zříceninu", xp: 80, target: 1, count: found("monuments-hrad") },
  { id: "statue", text: "Objev novou sochu, kříž nebo pomník", xp: 40, target: 1, count: found("monuments-sochy") },
  { id: "technical", text: "Objev novou technickou památku", xp: 60, target: 1, count: found("monuments-technicke") },
  {
    id: "archaeology",
    text: "Objev novou archeologickou lokalitu",
    xp: 60,
    target: 1,
    count: found("monuments-archeologie"),
  },
];

/** Small deterministic PRNG (mulberry32) seeded from the day, so everyone gets the same challenges. */
function rng(seedText: string): () => number {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day's 3 challenges: one hexagon challenge plus two different others. */
export function challengesFor(day: string): Challenge[] {
  const random = rng(`plzen-hex:${day}`);
  const hex = HEX_CHALLENGES[Math.floor(random() * HEX_CHALLENGES.length)];
  const pool = [...OTHER_CHALLENGES];
  const picked: Challenge[] = [];
  for (let i = 0; i < 2; i++) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return [hex, ...picked];
}

export function challengeStatuses(journal: Journal, day: string): ChallengeStatus[] {
  const entries = journal.byDay.get(day) ?? [];
  return challengesFor(day).map((challenge) => {
    const progress = Math.min(
      challenge.target,
      entries.reduce((sum, e) => sum + challenge.count(e), 0),
    );
    return { challenge, progress, done: progress >= challenge.target };
  });
}

/** XP from every challenge ever completed (each day is evaluated against its own challenges). */
export function challengesXp(journal: Journal): number {
  let xp = 0;
  for (const day of journal.byDay.keys()) {
    for (const s of challengeStatuses(journal, day)) if (s.done) xp += s.challenge.xp;
  }
  return xp;
}

export const todayKey = () => dayKey(Date.now());
