export type StatGroup = "explore" | "places" | "monuments" | "nature";

export interface StatItem {
  name: string;
  /** The item counts as visited once any of these H3 cells is unlocked. */
  cells: string[];
}

export interface StatDef {
  id: string;
  label: string;
  group: StatGroup;
  /** Player titles for reaching bronze, silver and gold, e.g. "Hradní panoš". */
  titles: [string, string, string];
  items: StatItem[];
}

export interface StatSummary {
  id: string;
  label: string;
  group: StatGroup;
  titles: [string, string, string];
  visited: number;
  total: number;
}

export interface Discovery {
  stat: StatDef;
  item: StatItem;
}

/** Tracks, for every stat, which of its items lie in an unlocked hexagon. */
export class Progress {
  private byCell = new Map<string, { stat: StatDef; index: number }[]>();
  private visited = new Map<string, Set<number>>();

  constructor(readonly stats: StatDef[]) {
    for (const stat of stats) {
      this.visited.set(stat.id, new Set());
      stat.items.forEach((item, index) => {
        for (const cell of item.cells) {
          const entries = this.byCell.get(cell) ?? [];
          entries.push({ stat, index });
          this.byCell.set(cell, entries);
        }
      });
    }
  }

  /** Marks a cell as unlocked and returns the items visited for the first time. */
  unlock(cell: string): Discovery[] {
    const found: Discovery[] = [];
    for (const { stat, index } of this.byCell.get(cell) ?? []) {
      const visited = this.visited.get(stat.id)!;
      if (visited.has(index)) continue;
      visited.add(index);
      found.push({ stat, item: stat.items[index] });
    }
    return found;
  }

  summary(): StatSummary[] {
    return this.stats.map(({ id, label, group, titles, items }) => ({
      id,
      label,
      group,
      titles,
      visited: this.visited.get(id)!.size,
      total: items.length,
    }));
  }
}
