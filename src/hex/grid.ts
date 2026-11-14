import { cellToBoundary, latLngToCell, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from "h3-js";
import type { FeatureCollection, Polygon, Position } from "geojson";
import type { RegionBoundary } from "../data/region";
import { HEX_MAX_SUBDIVISION_DEPTH, HEX_RESOLUTION, HEX_SUBDIVIDE_MIN_MONUMENTS } from "../config";

/**
 * Grid cell IDs:
 *   "<h3>"        a whole hexagon
 *   "<h3>-2"      triangle 2 of that hexagon (centre, vertex 2, vertex 3)
 *   "<h3>-23"     sub-triangle 3 of that triangle (0–2 = corners, 3 = middle), and so on.
 */
export interface HexGrid {
  /** Hexagons and triangles that together cover the region without gaps or overlaps. */
  cells: Set<string>;
  geojson: FeatureCollection<Polygon, { h3: string }>;
  /** The grid cell containing a point, or null outside the grid. */
  cellAt(lng: number, lat: number): string | null;
  /** Centre of a grid cell (average of its vertices). */
  centre(cell: string): [number, number];
}

type Triangle = [Position, Position, Position];

const mid = (a: Position, b: Position): Position => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** The 4 sub-triangles of a triangle: 0–2 at the corners, 3 in the middle. */
function splitTriangle([a, b, c]: Triangle): Triangle[] {
  const ab = mid(a, b);
  const bc = mid(b, c);
  const ca = mid(c, a);
  return [
    [a, ab, ca],
    [ab, b, bc],
    [ca, bc, c],
    [ab, bc, ca],
  ];
}

/**
 * Barycentric coordinates of p in triangle abc. Computed in plain lon/lat: barycentric coordinates
 * are invariant under affine maps, and at this scale lon/lat ↔ Web Mercator is affine for all practical purposes.
 */
function barycentric(p: Position, [a, b, c]: Triangle): [number, number, number] {
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const u = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / det;
  const v = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / det;
  return [u, v, 1 - u - v];
}

/** Which sub-triangle of `tri` contains p (always answers, also for points a hair outside). */
function subTriangleIndex(p: Position, tri: Triangle): number {
  const [u, v, w] = barycentric(p, tri);
  if (u >= 0.5) return 0;
  if (v >= 0.5) return 1;
  if (w >= 0.5) return 2;
  return 3;
}

function hexTriangles(h3: string): Triangle[] {
  const ring = cellToBoundary(h3, true).slice(0, -1); // drop closing vertex
  const centre: Position = [
    ring.reduce((s, v) => s + v[0], 0) / ring.length,
    ring.reduce((s, v) => s + v[1], 0) / ring.length,
  ];
  return ring.map((v, i) => [centre, v, ring[(i + 1) % ring.length]]);
}

/** Path of triangle indices for p inside a hexagon, HEX_MAX_SUBDIVISION_DEPTH long. */
function pathInHex(p: Position, triangles: Triangle[]): number[] {
  // Level 1: the triangle p is most "inside" of (largest minimum barycentric coordinate).
  let best = 0;
  let bestScore = -Infinity;
  triangles.forEach((t, i) => {
    const score = Math.min(...barycentric(p, t));
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  const path = [best];
  let tri = triangles[best];
  for (let depth = 1; depth < HEX_MAX_SUBDIVISION_DEPTH; depth++) {
    const i = subTriangleIndex(p, tri);
    path.push(i);
    tri = splitTriangle(tri)[i];
  }
  return path;
}

/** All prefixes of a point's cell path, coarsest first: "<h3>", "<h3>-2", "<h3>-23", … */
function idChain(h3: string, path: number[]): string[] {
  const ids = [h3];
  for (let i = 1; i <= path.length; i++) ids.push(`${h3}-${path.slice(0, i).join("")}`);
  return ids;
}

function cellPolygon(id: string, trianglesOf: (h3: string) => Triangle[]): Position[] {
  const [h3, path = ""] = id.split("-");
  if (!path) return cellToBoundary(h3, true);
  let tri = trianglesOf(h3)[Number(path[0])];
  for (const digit of path.slice(1)) tri = splitTriangle(tri)[Number(digit)];
  return [...tri, tri[0]];
}

/**
 * Covers the region with H3 hexagons (including ones that only partially overlap the border),
 * then splits hexagons — and recursively their triangles — that contain many points of interest.
 */
export function buildHexGrid(region: RegionBoundary, densityPoints: [number, number][] = []): HexGrid {
  const hexes = new Set<string>();
  for (const f of region.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const ids = polygonToCellsExperimental(poly, HEX_RESOLUTION, POLYGON_TO_CELLS_FLAGS.containmentOverlapping, true);
      for (const id of ids) hexes.add(id);
    }
  }

  const triangleCache = new Map<string, Triangle[]>();
  const trianglesOf = (h3: string) => {
    let t = triangleCache.get(h3);
    if (!t) triangleCache.set(h3, (t = hexTriangles(h3)));
    return t;
  };
  const chainAt = (lng: number, lat: number) => {
    const h3 = latLngToCell(lat, lng, HEX_RESOLUTION);
    return idChain(h3, pathInHex([lng, lat], trianglesOf(h3)));
  };

  const counts = new Map<string, number>();
  for (const [lng, lat] of densityPoints) {
    for (const id of chainAt(lng, lat)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const cells = new Set<string>();
  const place = (id: string, depth: number, childCount: number) => {
    if (depth < HEX_MAX_SUBDIVISION_DEPTH && (counts.get(id) ?? 0) >= HEX_SUBDIVIDE_MIN_MONUMENTS) {
      const sep = depth === 0 ? "-" : "";
      for (let i = 0; i < childCount; i++) place(`${id}${sep}${i}`, depth + 1, 4);
    } else {
      cells.add(id);
    }
  };
  for (const h3 of hexes) place(h3, 0, trianglesOf(h3).length);

  const features = [...cells].map((id) => ({
    type: "Feature" as const,
    properties: { h3: id },
    geometry: { type: "Polygon" as const, coordinates: [cellPolygon(id, trianglesOf)] },
  }));

  return {
    cells,
    geojson: { type: "FeatureCollection", features },
    cellAt(lng, lat) {
      return chainAt(lng, lat).find((id) => cells.has(id)) ?? null;
    },
    centre(cell) {
      const ring = cellPolygon(cell, trianglesOf).slice(0, -1);
      return [
        ring.reduce((s, v) => s + v[0], 0) / ring.length,
        ring.reduce((s, v) => s + v[1], 0) / ring.length,
      ];
    },
  };
}
