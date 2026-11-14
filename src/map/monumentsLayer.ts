import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type Map } from "maplibre-gl";
import type { Monuments } from "../data/monuments";
import { photoFigure, wikipediaPage, type MonumentPhoto } from "../data/photos";

const SOURCE = "monuments";

const FOUND_COLOR = "#8e44ad";
const LOCKED_COLOR = "#9aa3ad";
/** Pie images in 5 % steps: pie-0 … pie-20. */
const PIE_STEPS = 20;
/** Diameter of the largest cluster pie in CSS px; smaller clusters scale the same image down. */
const PIE_SIZE = 44;
const FOUND_TEXT = "✓ Objeveno";
const LOCKED_TEXT = "🔒 Ještě neobjeveno — odemkni tento hexagon";

/** Adds the layer; returns a function that re-marks which monuments are discovered. */
export function addMonumentsLayer(
  map: Map,
  monuments: Monuments,
  photos: Record<string, MonumentPhoto> = {},
): (isFound: (id: string) => boolean) => void {
  map.addSource(SOURCE, {
    type: "geojson",
    data: monuments,
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 40,
    // Each cluster also carries how many of its monuments are discovered (drawn as a pie chart).
    clusterProperties: { found: ["+", ["case", ["to-boolean", ["get", "found"]], 1, 0]] },
    attribution: 'Památky © <a href="https://www.npu.cz/">NPÚ</a> (CC BY 4.0)',
  });

  map.addLayer({
    id: "monument-point",
    type: "circle",
    source: SOURCE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": ["case", ["!", ["to-boolean", ["get", "found"]]], LOCKED_COLOR, ["get", "nkp"], "#f1c40f", FOUND_COLOR],
      "circle-radius": ["case", ["get", "nkp"], 8, 6],
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "monument-label",
    type: "symbol",
    source: SOURCE,
    filter: ["!", ["has", "point_count"]],
    minzoom: 15,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold"],
      "text-size": 12,
      "text-offset": [0, 1.2],
      "text-anchor": "top",
      "text-max-width": 10,
    },
    paint: { "text-color": "#3c1a4d", "text-halo-color": "#fff", "text-halo-width": 1.5 },
  });

  addPieImages(map);
  const found: ExpressionSpecification = ["get", "found"];
  const total: ExpressionSpecification = ["get", "point_count"];
  map.addLayer(
    {
      id: "monument-clusters",
      type: "symbol",
      source: SOURCE,
      filter: ["has", "point_count"],
      layout: {
        // Exactly grey when nothing is found and exactly purple when everything is; in between,
        // the nearest 5 % step, but never rounded to an empty or full pie.
        "icon-image": [
          "case",
          ["==", found, 0],
          "pie-0",
          [">=", found, total],
          `pie-${PIE_STEPS}`,
          ["concat", "pie-", ["to-string", ["max", 1, ["min", PIE_STEPS - 1, ["round", ["*", PIE_STEPS, ["/", found, total]]]]]]],
        ],
        "icon-size": ["step", total, 26 / PIE_SIZE, 20, 34 / PIE_SIZE, 100, 1],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Semibold"],
        "text-size": 12,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#fff", "text-halo-color": "rgba(0, 0, 0, 0.45)", "text-halo-width": 1 },
    },
    "monument-point",
  );
  map.on("click", "monument-clusters", async (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const zoom = await map.getSource<GeoJSONSource>(SOURCE)!.getClusterExpansionZoom(feature.properties.cluster_id);
    map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
  });

  map.on("click", "monument-point", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const p = feature.properties as {
      id: string;
      name: string;
      kind: string;
      nkp: boolean | string;
      found: boolean | string;
      municipality?: string;
    };
    // Properties of rendered features come back serialised, so booleans may arrive as strings.
    const nkp = p.nkp === true || p.nkp === "true";
    const found = p.found === true || p.found === "true";

    const el = document.createElement("div");
    el.className = "monument-popup";
    const photo = photos[p.id];
    if (photo) el.append(photoFigure(photo, p.name, found));
    const title = document.createElement("strong");
    title.textContent = p.name;
    el.append(title);
    if (nkp) el.append(Object.assign(document.createElement("span"), { className: "badge", textContent: "Národní kulturní památka" }));
    if (p.municipality && !p.name.includes(p.municipality))
      el.append(Object.assign(document.createElement("div"), { textContent: p.municipality }));
    if (p.kind && !p.name.startsWith(p.kind)) el.append(Object.assign(document.createElement("div"), { textContent: p.kind }));
    el.append(Object.assign(document.createElement("div"), { className: "muted", textContent: `ÚSKP ${p.id}` }));
    el.append(
      Object.assign(document.createElement("div"), {
        className: found ? "popup-state is-found" : "popup-state",
        textContent: found ? FOUND_TEXT : LOCKED_TEXT,
      }),
    );
    if (photo?.wiki) {
      el.append(
        Object.assign(document.createElement("a"), {
          className: "popup-wiki",
          href: wikipediaPage(photo),
          target: "_blank",
          rel: "noopener",
          textContent: "Více na Wikipedii →",
        }),
      );
    }

    new maplibregl.Popup({ offset: 10, maxWidth: "280px" })
      .setLngLat((feature.geometry as GeoJSON.Point).coordinates as [number, number])
      .setDOMContent(el)
      .addTo(map);
  });

  for (const layer of ["monument-clusters", "monument-point"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }

  return (isFound) => {
    map.getSource<GeoJSONSource>(SOURCE)!.setData({
      ...monuments,
      features: monuments.features.map((f) => ({ ...f, properties: { ...f.properties, found: isFound(f.properties.id) } })),
    });
  };
}

/**
 * Registers pie-chart images for cluster markers: pie-0 (all grey) … pie-20 (all purple), the
 * discovered share drawn clockwise from 12 o'clock, with a white ring. Drawn at 2× for sharp edges.
 */
function addPieImages(map: Map): void {
  const ratio = 2;
  const px = PIE_SIZE * ratio;
  const centre = px / 2;
  const ring = 2 * ratio;
  const radius = centre - ring;
  for (let step = 0; step <= PIE_STEPS; step++) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(centre, centre, centre, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centre, centre, radius, 0, Math.PI * 2);
    ctx.fillStyle = step === PIE_STEPS ? FOUND_COLOR : LOCKED_COLOR;
    ctx.fill();
    if (step > 0 && step < PIE_STEPS) {
      const start = -Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(centre, centre);
      ctx.arc(centre, centre, radius, start, start + (step / PIE_STEPS) * Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = FOUND_COLOR;
      ctx.fill();
    }
    map.addImage(`pie-${step}`, ctx.getImageData(0, 0, px, px), { pixelRatio: ratio });
  }
}
