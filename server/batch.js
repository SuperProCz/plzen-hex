// Validation of incoming visit batches. Kept free of I/O so it can be unit-tested.

/** Grid cell ID: H3 res-7 cell ("87…", 15 hex chars), optionally "-" + triangle path (see src/hex/grid.ts). */
export const CELL_RE = /^87[0-9a-f]{13}(-[0-9][0-3]{0,2})?$/;
export const MAX_CELLS = 500;
/** One client can't plausibly enter the same cell more often than this between two syncs. */
export const MAX_COUNT = 100;

/**
 * Parses `{"visits": {"<cell>": <count>, …}}` into parallel arrays for the DB upsert.
 * Returns null for anything malformed (the whole batch is rejected).
 */
export function parseBatch(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const visits = body?.visits;
  if (!visits || typeof visits !== "object" || Array.isArray(visits)) return null;
  const entries = Object.entries(visits);
  if (entries.length === 0 || entries.length > MAX_CELLS) return null;

  const cells = [];
  const counts = [];
  for (const [cell, count] of entries) {
    if (!CELL_RE.test(cell) || !Number.isInteger(count) || count < 1 || count > MAX_COUNT) return null;
    cells.push(cell);
    counts.push(count);
  }
  return { cells, counts };
}
