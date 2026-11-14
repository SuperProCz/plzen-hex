import type { StatSummary } from "../stats/progress";
import { currentTier, TIERS } from "../stats/tiers";

/** XP for each newly visited item, per stat. Category stats give no XP per item (no double counting). */
const XP_PER_ITEM: Record<string, number> = {
  hexes: 10,
  districts: 100,
  "municipality-mesto": 50,
  "municipality-mestys": 30,
  "municipality-obec": 20,
  villages: 5,
  monuments: 5,
  nkp: 45,
  "pois-rozhledna": 40,
  "pois-vrchol": 15,
};

/** XP for reaching each tier of any achievement (cumulative: gold also pays bronze and silver). */
export const TIER_XP = { bronze: 50, silver: 150, gold: 400 } as const;

export function statsXp(stats: StatSummary[]): number {
  let xp = 0;
  for (const s of stats) {
    xp += (XP_PER_ITEM[s.id] ?? 0) * s.visited;
    const tier = currentTier(s.visited, s.total);
    if (tier) for (const t of TIERS.slice(0, TIERS.findIndex((x) => x.tier === tier) + 1)) xp += TIER_XP[t.tier];
  }
  return xp;
}

/** Total XP needed to reach a level: 0, 100, 300, 600, 1 000, … */
export const xpForLevel = (level: number) => 50 * level * (level - 1);

export function levelFor(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

const LEVEL_TITLES: [number, string][] = [
  [1, "Nováček"],
  [3, "Turista"],
  [5, "Výletník"],
  [8, "Poutník"],
  [12, "Cestovatel"],
  [16, "Objevitel"],
  [20, "Znalec kraje"],
  [25, "Strážce stezek"],
  [30, "Legenda Plzeňska"],
];

export function levelTitle(level: number): string {
  let title = LEVEL_TITLES[0][1];
  for (const [min, t] of LEVEL_TITLES) if (level >= min) title = t;
  return title;
}
