const QUEUE_KEY = "plzen-hex:visit-queue";
const OPT_OUT_KEY = "plzen-hex:analytics-off";
/** Re-entering the same cell within this time (GPS jitter at an edge) doesn't count again. */
const REENTRY_MS = 10 * 60 * 1000;
const FLUSH_INTERVAL_MS = 60 * 1000;
/** Must match the server's limits (server/batch.js). */
const MAX_CELLS_PER_BATCH = 500;
const MAX_COUNT_PER_CELL = 100;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore — worst case some counts are lost.
  }
}

/**
 * Counts how many times the player enters each grid cell and sends the counts, anonymously, whenever
 * the device is online. Only `{cell: count}` is sent: no user ID, position, or time.
 * Counts wait in localStorage until the server has accepted them, so nothing is lost offline.
 */
export class VisitReporter {
  private queue: Record<string, number> = read(QUEUE_KEY, {});
  private enteredAt = new Map<string, number>();
  private current: string | null = null;
  private sending = false;

  constructor(private readonly url: string | null) {
    window.addEventListener("online", () => void this.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.flush();
    });
    window.setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    void this.flush();
  }

  get enabled(): boolean {
    return this.url !== null && !read(OPT_OUT_KEY, false);
  }

  /** Whether sending is possible at all in this build. */
  get available(): boolean {
    return this.url !== null;
  }

  setEnabled(on: boolean): void {
    write(OPT_OUT_KEY, !on);
    if (!on) {
      // Opting out also discards anything not sent yet.
      this.queue = {};
      write(QUEUE_KEY, this.queue);
    } else void this.flush();
  }

  /** Call with the player's current cell on every accurate GPS fix; counts only actual entries. */
  record(cell: string, now = Date.now()): void {
    if (cell === this.current) return;
    this.current = cell;
    const last = this.enteredAt.get(cell);
    this.enteredAt.set(cell, now);
    if (!this.enabled || (last !== undefined && now - last < REENTRY_MS)) return;
    this.queue[cell] = (this.queue[cell] ?? 0) + 1;
    write(QUEUE_KEY, this.queue);
    void this.flush();
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.sending || !navigator.onLine) return;
    const batch: Record<string, number> = {};
    for (const [cell, count] of Object.entries(this.queue).slice(0, MAX_CELLS_PER_BATCH)) {
      batch[cell] = Math.min(count, MAX_COUNT_PER_CELL);
    }
    if (!Object.keys(batch).length) return;

    this.sending = true;
    let sent = false;
    try {
      const res = await fetch(this.url!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visits: batch }),
        keepalive: true,
      });
      // 400 means the server will never accept this batch (e.g. cells from an old grid) — drop it.
      if (res.ok || res.status === 400) {
        // Subtract what was sent; anything recorded meanwhile stays queued.
        for (const [cell, count] of Object.entries(batch)) {
          const left = (this.queue[cell] ?? 0) - count;
          if (left > 0) this.queue[cell] = left;
          else delete this.queue[cell];
        }
        write(QUEUE_KEY, this.queue);
        sent = true;
      }
    } catch {
      // Offline or server unreachable: keep the queue and retry later.
    } finally {
      this.sending = false;
    }
    // Entries recorded while this request was in flight go out right away (failures wait for the timer).
    if (sent && Object.keys(this.queue).length) await this.flush();
  }
}
