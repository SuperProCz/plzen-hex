import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { REGION_BOUNDARY_URL } from "../config";

export type RegionBoundary = FeatureCollection<Polygon | MultiPolygon>;

export async function loadRegionBoundary(): Promise<RegionBoundary> {
  const res = await fetch(REGION_BOUNDARY_URL);
  if (!res.ok) throw new Error(`Failed to load region boundary: ${res.status}`);
  return res.json();
}
