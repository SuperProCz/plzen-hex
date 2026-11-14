/** Great-circle distance in metres between two lon/lat points. */
export function distanceM([lng1, lat1]: number[], [lng2, lat2]: number[]): number {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Compass direction from a to b as an arrow, e.g. "↗". */
export function directionArrow(a: number[], b: number[]): string {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  const angle = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = north, clockwise
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return arrows[Math.round(((angle + 360) % 360) / 45) % 8];
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} km`;
}

/** Area-weighted centroid of a polygon ring (lon/lat; fine at this scale). */
export function ringCentroid(ring: number[][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
}
