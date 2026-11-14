import type { Discovery, Progress } from "../stats/progress";
import { dayKey } from "./time";

export interface JournalEntry {
  cell: string;
  /** null = unlocked by an older app version that didn't record the time. */
  time: number | null;
  /** Items (places, monuments, …) visited for the first time by this unlock. */
  found: Discovery[];
}

/** All unlocks in chronological order, with lookups the milestones and challenges need. */
export class Journal {
  readonly entries: JournalEntry[] = [];
  readonly cellTime = new Map<string, number | null>();
  readonly byDay = new Map<string, JournalEntry[]>();

  add(entry: JournalEntry): void {
    this.entries.push(entry);
    this.cellTime.set(entry.cell, entry.time);
    if (entry.time !== null) {
      const key = dayKey(entry.time);
      const day = this.byDay.get(key) ?? [];
      day.push(entry);
      this.byDay.set(key, day);
    }
  }

  /** Timed entries only, oldest first. */
  timed(): (JournalEntry & { time: number })[] {
    return this.entries.filter((e): e is JournalEntry & { time: number } => e.time !== null);
  }
}

/**
 * Replays stored unlocks through Progress in chronological order (untimed ones first), so every entry
 * knows exactly what it discovered.
 */
export function replayJournal(unlocks: [string, number | null][], progress: Progress): Journal {
  const journal = new Journal();
  const sorted = [...unlocks].sort(([, a], [, b]) => (a ?? -Infinity) - (b ?? -Infinity));
  for (const [cell, time] of sorted) journal.add({ cell, time, found: progress.unlock(cell) });
  return journal;
}
