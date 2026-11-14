import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type Map,
  type SymbolLayerSpecification,
} from "maplibre-gl";
import { poiLabel, type PoiProps, type Pois } from "../data/pois";

const SOURCE = "pois";
const found: ExpressionSpecification = ["to-boolean", ["get", "found"]];
const isTower: ExpressionSpecification = ["==", ["get", "kind"], "rozhledna"];

/** Lookout towers (always) and peaks (from zoom 10). Returns a function that re-marks what's discovered. */
export function addPoiLayer(map: Map, pois: Pois): (isFound: (id: string) => boolean) => void {
  map.addSource(SOURCE, {
    type: "geojson",
    data: pois,
    attribution: 'Rozhledny a vrcholy © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

  map.addLayer({
    id: "poi-peak",
    type: "circle",
    source: SOURCE,
    minzoom: 10,
    filter: ["!", isTower],
    paint: {
      "circle-color": ["case", found, "#8d5a2b", "#9aa3ad"],
      "circle-radius": 4,
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 1.5,
    },
  });
  map.addLayer({
    id: "poi-tower",
    type: "circle",
    source: SOURCE,
    filter: isTower,
    paint: {
      "circle-color": ["case", found, "#16a085", "#9aa3ad"],
      "circle-radius": 7,
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
  const labelLayout: SymbolLayerSpecification["layout"] = {
    "text-font": ["Open Sans Semibold"],
    "text-size": 11,
    "text-offset": [0, 1.1],
    "text-anchor": "top",
    "text-max-width": 10,
  };
  const labelPaint: SymbolLayerSpecification["paint"] = {
    "text-color": "#3b2a1a",
    "text-halo-color": "#fff",
    "text-halo-width": 1.5,
  };
  map.addLayer({
    id: "poi-tower-label",
    type: "symbol",
    source: SOURCE,
    minzoom: 12,
    filter: isTower,
    layout: { ...labelLayout, "text-field": ["get", "name"] },
    paint: labelPaint,
  });
  map.addLayer({
    id: "poi-peak-label",
    type: "symbol",
    source: SOURCE,
    minzoom: 13,
    filter: ["!", isTower],
    layout: {
      ...labelLayout,
      "text-field": [
        "case",
        ["to-boolean", ["get", "ele"]],
        ["concat", ["get", "name"], " (", ["to-string", ["get", "ele"]], " m)"],
        ["get", "name"],
      ],
    },
    paint: labelPaint,
  });

  for (const layer of ["poi-peak", "poi-tower"]) {
    map.on("click", layer, (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const p = feature.properties as PoiProps & { found?: boolean | string };
      const isFound = p.found === true || p.found === "true";
      const ele = p.ele === null || (p.ele as unknown) === "null" ? null : Number(p.ele);

      const el = document.createElement("div");
      el.className = "monument-popup";
      const title = document.createElement("strong");
      title.textContent = poiLabel({ ...p, ele });
      el.append(title);
      const kind = p.kind === "rozhledna" ? "Rozhledna" : "Vrchol";
      el.append(Object.assign(document.createElement("div"), { textContent: p.municipality ? `${kind} · ${p.municipality}` : kind }));
      el.append(
        Object.assign(document.createElement("div"), {
          className: isFound ? "popup-state is-found" : "popup-state",
          textContent: isFound ? "✓ Objeveno" : "🔒 Ještě neobjeveno — odemkni tento hexagon",
        }),
      );
      new maplibregl.Popup({ offset: 10, maxWidth: "260px" })
        .setLngLat((feature.geometry as GeoJSON.Point).coordinates as [number, number])
        .setDOMContent(el)
        .addTo(map);
    });
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }

  return (isFound) => {
    map.getSource<GeoJSONSource>(SOURCE)!.setData({
      ...pois,
      features: pois.features.map((f) => ({ ...f, properties: { ...f.properties, found: isFound(f.properties.id) } })),
    });
  };
}
