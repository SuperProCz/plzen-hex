export type Tier = "bronze" | "silver" | "gold";

export const TIERS: { tier: Tier; label: string; share: number }[] = [
  { tier: "bronze", label: "Bronz", share: 0.1 },
  { tier: "silver", label: "Stříbro", share: 0.5 },
  { tier: "gold", label: "Zlato", share: 1 },
];

/** Items needed for a tier. At least 1, so tiny stats (e.g. 7 districts) still need a visit. */
export function tierTarget(share: number, total: number): number {
  // Epsilon guards against float noise, e.g. 0.1 * 30 = 3.0000000000000004.
  return Math.max(1, Math.ceil(share * total - 1e-9));
}

export function currentTier(visited: number, total: number): Tier | null {
  let reached: Tier | null = null;
  for (const t of TIERS) if (total > 0 && visited >= tierTarget(t.share, total)) reached = t.tier;
  return reached;
}

export function nextTier(visited: number, total: number) {
  for (const t of TIERS) {
    const target = tierTarget(t.share, total);
    if (visited < target) return { ...t, target };
  }
  return null;
}

export const tierLabel = (tier: Tier) => TIERS.find((t) => t.tier === tier)!.label;
