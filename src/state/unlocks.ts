import { HEX_MAX_SUBDIVISION_DEPTH, HEX_RESOLUTION, HEX_SUBDIVIDE_MIN_MONUMENTS } from "../config";

// Keyed by grid settings: cell IDs from a differently built grid don't match.
const STORAGE_KEY = `plzen-hex:unlocked:r${HEX_RESOLUTION}-tri${HEX_MAX_SUBDIVISION_DEPTH}-n${HEX_SUBDIVIDE_MIN_MONUMENTS}`;

/**
 * Unlocked cells of the current player with the time each was unlocked (ms since epoch).
 * This is the only game state that is stored: XP, levels, milestones, streaks and challenges are all
 * derived from it. Persisted in localStorage for now; will be backed by the API once users can register.
 */
export class UnlockStore {
  /** null = unlocked by an older version of the app that didn't record the time. */
  private cells = new Map<string, number | null>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        // Old format: a plain list of cell IDs.
        for (const cell of parsed) if (typeof cell === "string") this.cells.set(cell, null);
      } else if (parsed && typeof parsed === "object") {
        for (const [cell, time] of Object.entries(parsed)) {
          this.cells.set(cell, typeof time === "number" ? time : null);
        }
      }
    } catch {
      // Storage unavailable (private mode etc.) or corrupt — start empty.
    }
  }

  get size(): number {
    return this.cells.size;
  }

  has(cell: string): boolean {
    return this.cells.has(cell);
  }

  entries(): [string, number | null][] {
    return [...this.cells];
  }

  /** Returns true if the cell was newly unlocked. */
  unlock(cell: string, time = Date.now()): boolean {
    if (this.cells.has(cell)) return false;
    this.cells.set(cell, time);
    this.save();
    return true;
  }

  /** Forgets all progress. */
  clear(): void {
    this.cells.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.cells)));
    } catch {
      // Ignore — progress just won't survive a reload.
    }
  }
}
