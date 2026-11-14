/** Local calendar day, e.g. "2026-11-13". */
export function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The day key `offset` days after `key` (handles month ends and DST). */
export function shiftDay(key: string, offset: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + offset, 12).getTime());
}

/** Czech plural: plural(2, "den", "dny", "dní") → "dny". */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export const formatDate = (time: number) =>
  new Date(time).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });

export const formatDateTime = (time: number) =>
  new Date(time).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
