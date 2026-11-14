import maplibregl, { type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { INITIAL_ZOOM, MAP_BOUNDS_PADDING_DEG, MIN_ZOOM, PLZEN_CENTER, REGION_BOUNDS } from "../config";

const osmStyle: StyleSpecification = {
  version: 8,
  // Fonts for text labels (cluster counts, monument names), bundled in public/fonts so labels also work
  // offline. Only the Latin, Latin Extended (Czech) and punctuation ranges are included.
  glyphs: `${location.origin}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function createMap(container: string | HTMLElement, { geolocate = true } = {}): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: osmStyle,
    center: PLZEN_CENTER,
    zoom: INITIAL_ZOOM,
    minZoom: MIN_ZOOM,
    maxZoom: 18,
    maxBounds: maplibregl.LngLatBounds.convert(REGION_BOUNDS).toArray().map(([lng, lat], i) => {
      const d = i === 0 ? -MAP_BOUNDS_PADDING_DEG : MAP_BOUNDS_PADDING_DEG;
      return [lng + d, lat + d];
    }) as LngLatBoundsLike,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
  if (geolocate) map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      // The game draws its own position dot (see userMarker.ts); this control only centres/follows.
      showUserLocation: false,
      showAccuracyCircle: false,
    }),
    "top-right",
  );

  return map;
}
