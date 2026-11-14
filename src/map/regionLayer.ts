import type { Map } from "maplibre-gl";
import type { Feature, Polygon, Position } from "geojson";
import type { RegionBoundary } from "../data/region";

/** World polygon with the region cut out — used to dim everything outside the kraj. */
function buildOutsideMask(region: RegionBoundary): Feature<Polygon> {
  const world: Position[] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  const holes: Position[][] = [];
  for (const f of region.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) holes.push(poly[0]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [world, ...holes] },
  };
}

export function addRegionLayer(map: Map, region: RegionBoundary): void {
  map.addSource("region", { type: "geojson", data: region });
  map.addSource("region-mask", { type: "geojson", data: buildOutsideMask(region) });

  map.addLayer({
    id: "region-mask",
    type: "fill",
    source: "region-mask",
    paint: { "fill-color": "#1b1f24", "fill-opacity": 0.35 },
  });
  map.addLayer({
    id: "region-outline",
    type: "line",
    source: "region",
    paint: { "line-color": "#0b5cad", "line-width": 2.5 },
  });
}
