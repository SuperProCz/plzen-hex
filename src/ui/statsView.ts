import type { StatGroup, StatSummary } from "../stats/progress";
import { currentTier, nextTier, TIERS, tierTarget, type Tier } from "../stats/tiers";

/** The player title earned for a stat's current tier, e.g. "Hradní panoš". */
export function tierTitle(s: StatSummary, tier: Tier): string {
  return s.titles[TIERS.findIndex((t) => t.tier === tier)];
}

// Shared building blocks for showing achievements (map panel and home screen).

export const GROUP_TITLES: Partial<Record<StatGroup, string>> = {
  places: "Místa",
  monuments: "Památky",
  nature: "Příroda a výhledy",
};

export const fmt = (n: number) => n.toLocaleString("cs-CZ");
export const percent = (part: number, total: number) => (total ? Math.min(100, (part / total) * 100) : 0);

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function medal(tier: Tier | null, title?: string): HTMLElement {
  const m = el("span", "medal");
  m.dataset.tier = tier ?? "none";
  if (title) m.title = title;
  return m;
}

/** One achievement: medal, name, count, bar with bronze/silver ticks and what's needed for the next tier. */
export function statRow(s: StatSummary): HTMLElement {
  const tier = currentTier(s.visited, s.total);
  const next = nextTier(s.visited, s.total);

  const row = el("div", "stat-row");
  row.dataset.tier = tier ?? "none";
  const body = el("div", "stat-body");
  const head = el("div", "stat-head");
  head.append(el("span", "stat-label", s.label), el("span", "stat-count", `${fmt(s.visited)} / ${fmt(s.total)}`));

  const bar = el("div", "status-bar");
  const fill = el("div", "status-fill");
  fill.style.width = `${percent(s.visited, s.total)}%`;
  bar.append(fill);
  for (const t of TIERS.slice(0, -1)) {
    const tick = el("span", "tier-tick");
    tick.dataset.tier = t.tier;
    tick.style.left = `${percent(tierTarget(t.share, s.total), s.total)}%`;
    bar.append(tick);
  }

  const caption = next ? `${next.label}: ještě ${fmt(next.target - s.visited)}` : "Zlato — kompletně splněno!";
  const foot = el("div", "stat-next");
  if (tier) foot.append(el("span", "stat-title", tierTitle(s, tier)), document.createTextNode(" · "));
  foot.append(caption);
  body.append(head, bar, foot);
  row.append(medal(tier, tier ? TIERS.find((t) => t.tier === tier)!.label : "Zatím bez odznaku"), body);
  return row;
}

/** "Úroveň 5 · Výletník" with an XP bar to the next level. */
export function levelBlock(level: number, title: string, progress: number, span: number, xp: number): HTMLElement {
  const block = el("div", "level-block");
  const head = el("div", "level-head");
  const badge = el("span", "level-badge", String(level));
  badge.title = `Úroveň ${level}`;
  const name = el("div", "level-name");
  name.append(el("strong", undefined, title), el("span", undefined, `Úroveň ${level} · ${fmt(xp)} XP`));
  head.append(badge, name);
  const bar = el("div", "status-bar xp-bar");
  const fill = el("div", "status-fill");
  fill.style.width = `${percent(progress, span)}%`;
  bar.append(fill);
  block.append(head, bar, el("div", "stat-next", `Do úrovně ${level + 1}: ještě ${fmt(span - progress)} XP`));
  return block;
}

export function medalCounts(stats: StatSummary[]): HTMLElement {
  const counts = el("div", "medal-counts");
  for (const t of [...TIERS].reverse()) {
    const n = stats.filter((s) => currentTier(s.visited, s.total) === t.tier).length;
    const item = el("span", "medal-count");
    item.append(medal(t.tier, t.label), document.createTextNode(String(n)));
    counts.append(item);
  }
  return counts;
}
