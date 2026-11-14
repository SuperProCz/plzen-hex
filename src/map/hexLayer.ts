import type { ExpressionSpecification, Map } from "maplibre-gl";
import type { HexGrid } from "../hex/grid";

const SOURCE = "hexes";
const unlocked: ExpressionSpecification = ["boolean", ["feature-state", "unlocked"], false];

export function addHexLayer(map: Map, grid: HexGrid, beforeId?: string): void {
  map.addSource(SOURCE, { type: "geojson", data: grid.geojson, promoteId: "h3" });

  map.addLayer(
    {
      id: "hex-fill",
      type: "fill",
      source: SOURCE,
      paint: {
        "fill-color": ["case", unlocked, "#2ecc71", "#2b2f36"],
        "fill-opacity": ["case", unlocked, 0.15, 0.45],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "hex-line",
      type: "line",
      source: SOURCE,
      paint: {
        "line-color": ["case", unlocked, "#1e9e55", "#ffffff"],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 11, 0.6],
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 12, 1.5, 15, 2.5],
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "hex-current",
      type: "line",
      source: SOURCE,
      filter: ["==", ["get", "h3"], ""],
      paint: { "line-color": "#ff8c1a", "line-width": 3 },
    },
    beforeId,
  );
}

export function setHexUnlocked(map: Map, cell: string): void {
  map.setFeatureState({ source: SOURCE, id: cell }, { unlocked: true });
}

export function setCurrentHex(map: Map, cell: string | null): void {
  map.setFilter("hex-current", ["==", ["get", "h3"], cell ?? ""]);
}

