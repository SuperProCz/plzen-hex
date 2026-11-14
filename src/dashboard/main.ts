import "./dashboard.css";
import type { ExpressionSpecification, MapMouseEvent } from "maplibre-gl";
import { createMap } from "../map/createMap";
import { addRegionLayer } from "../map/regionLayer";
import { loadRegionBoundary } from "../data/region";
import { loadMonuments } from "../data/monuments";
import { loadPlaces } from "../data/places";
import { makePlaceNamer } from "../data/placeNamer";
import { buildHexGrid } from "../hex/grid";
import { plural } from "../game/time";
import { VISITS_READ_URL } from "../config";
import { el, fmt } from "../ui/statsView";

const REFRESH_MS = 60 * 1000;
const TOP_N = 10;

interface VisitsResponse {
  minVisits: number;
  totalVisits: number;
  visitedCells: number;
  updatedAt: string | null;
  cells: Record<string, number>;
}

/**
 * Sequential single-hue ramp (blue, light → dark) for magnitude. Fixed, roughly logarithmic class breaks
 * so the map stays comparable over time; the first class starts at the server's privacy threshold.
 */
const RAMP = ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"];
const breaks = (min: number) => [min, 5, 10, 25, 50, 100, 250].map((b, i) => (i === 0 ? b : Math.max(b, min + i)));

const visitsWord = (n: number) => plural(n, "vstup", "vstupy", "vstupů");

const panel = document.getElementById("panel")!;
const map = createMap("map", { geolocate: false });
const tooltip = el("div", "dash-tooltip");
tooltip.hidden = true;
document.body.append(tooltip);

function tile(label: string, value: string, note?: string): HTMLElement {
  const t = el("div", "dash-tile");
  t.append(el("span", "dash-tile-label", label), el("strong", "dash-tile-value", value));
  if (note) t.append(el("span", "dash-tile-note", note));
  return t;
}

function legend(classBreaks: number[]): HTMLElement {
  const box = el("div", "dash-legend");
  box.append(el("div", "dash-legend-title", "Počet vstupů do hexagonu"));
  const row = el("div", "dash-legend-row");
  RAMP.forEach((color, i) => {
    const item = el("div", "dash-legend-item");
    const swatch = el("span", "dash-legend-swatch");
    swatch.style.background = color;
    const next = classBreaks[i + 1];
    item.append(swatch, el("span", undefined, next ? `${classBreaks[i]}–${next - 1}` : `${classBreaks[i]}+`));
    row.append(item);
  });
  box.append(row);
  return box;
}

/** Horizontal bars for a ranked list; values in text ink, bar in the ramp's mid step. */
function rankedTable(caption: string, rows: { label: string; value: number }[], empty: string): HTMLElement {
  const section = el("section", "dash-section");
  section.append(el("h2", undefined, caption));
  if (!rows.length) {
    section.append(el("p", "dash-muted", empty));
    return section;
  }
  const max = Math.max(...rows.map((r) => r.value));
  const table = el("table", "dash-table");
  const body = el("tbody");
  rows.forEach((r, i) => {
    const tr = el("tr");
    const bar = el("span", "dash-bar");
    bar.style.width = `${(r.value / max) * 100}%`;
    const labelCell = el("td", "dash-table-label");
    labelCell.append(el("span", "dash-rank", `${i + 1}.`), el("span", undefined, r.label), bar);
    tr.append(labelCell, el("td", "dash-table-value", fmt(r.value)));
    body.append(tr);
  });
  table.append(body);
  section.append(table);
  return section;
}

function renderMessage(text: string): void {
  panel.replaceChildren(header(), el("p", "dash-muted", text));
}

function header(): HTMLElement {
  const h = el("header", "dash-header");
  const back = el("a", "dash-back", "← Hrát Plzeň Hex");
  back.href = "/";
  h.append(back, el("h1", undefined, "Návštěvnost kraje"));
  h.append(el("p", "dash-muted", "Kolikrát hráči vstoupili do jednotlivých hexagonů. Anonymně: bez identity, polohy i času."));
  return h;
}

renderMessage("Načítám…");

map.on("load", async () => {
  let region, monuments, places;
  try {
    [region, monuments, places] = await Promise.all([loadRegionBoundary(), loadMonuments(), loadPlaces()]);
  } catch {
    renderMessage("Nepodařilo se načíst mapová data. Obnov stránku.");
    return;
  }
  const grid = buildHexGrid(
    region,
    monuments.features.map((f) => f.geometry.coordinates as [number, number]),
  );
  const nameAt = makePlaceNamer(places);
  const placeOf = new Map<string, { name: string; district: string }>();
  const place = (cell: string) => {
    let p = placeOf.get(cell);
    if (!p) placeOf.set(cell, (p = nameAt(grid.centre(cell))));
    return p;
  };

  addRegionLayer(map, region);
  map.addSource("heat", { type: "geojson", data: grid.geojson, promoteId: "h3" });
  const visits: ExpressionSpecification = ["coalesce", ["feature-state", "visits"], 0];
  map.addLayer(
    {
      id: "heat-fill",
      type: "fill",
      source: "heat",
      paint: {
        // Rebuilt with the server's threshold once data arrives (see applyBreaks).
        "fill-color": RAMP[0],
        "fill-opacity": ["case", [">", visits, 0], 0.78, 0],
      },
    },
    "region-outline",
  );
  map.addLayer(
    {
      id: "heat-line",
      type: "line",
      source: "heat",
      paint: {
        "line-color": "#ffffff",
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 0.6],
        "line-opacity": ["case", [">", visits, 0], 0.9, 0.12],
      },
    },
    "region-outline",
  );

  const applyBreaks = (classBreaks: number[]) => {
    const expr: ExpressionSpecification = ["step", visits, RAMP[0]];
    classBreaks.slice(1).forEach((b, i) => expr.push(b, RAMP[i + 1]));
    map.setPaintProperty("heat-fill", "fill-color", expr);
  };

  let current: Record<string, number> = {};
  let hovered: string | null = null;
  const setHover = (cell: string | null) => {
    if (hovered) map.setFeatureState({ source: "heat", id: hovered }, { hover: false });
    hovered = cell;
    if (cell) map.setFeatureState({ source: "heat", id: cell }, { hover: true });
  };

  const showTooltip = (e: MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
    const cell = e.features?.[0]?.properties?.h3 as string | undefined;
    const n = cell ? current[cell] : undefined;
    if (!cell || !n) {
      tooltip.hidden = true;
      setHover(null);
      return;
    }
    setHover(cell);
    tooltip.replaceChildren(el("strong", undefined, place(cell).name), el("span", undefined, `${fmt(n)} ${visitsWord(n)}`));
    tooltip.style.left = `${e.originalEvent.clientX + 14}px`;
    tooltip.style.top = `${e.originalEvent.clientY + 14}px`;
    tooltip.hidden = false;
    map.getCanvas().style.cursor = "pointer";
  };
  map.on("mousemove", "heat-fill", showTooltip);
  map.on("click", "heat-fill", showTooltip); // touch screens have no hover
  map.on("mouseleave", "heat-fill", () => {
    tooltip.hidden = true;
    setHover(null);
    map.getCanvas().style.cursor = "";
  });

  async function refresh(): Promise<void> {
    let data: VisitsResponse;
    try {
      const res = await fetch(VISITS_READ_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch {
      if (!Object.keys(current).length) renderMessage("Server se statistikami je teď nedostupný. Zkusím to znovu za minutu.");
      return;
    }

    for (const cell of Object.keys(current)) map.setFeatureState({ source: "heat", id: cell }, { visits: 0 });
    current = Object.fromEntries(Object.entries(data.cells).filter(([cell]) => grid.cells.has(cell)));
    for (const [cell, n] of Object.entries(current)) map.setFeatureState({ source: "heat", id: cell }, { visits: n });
    const classBreaks = breaks(data.minVisits);
    applyBreaks(classBreaks);

    const shown = Object.entries(current).sort((a, b) => b[1] - a[1]);
    const byDistrict = new Map<string, number>();
    for (const [cell, n] of shown) {
      const d = place(cell).district;
      if (d) byDistrict.set(d, (byDistrict.get(d) ?? 0) + n);
    }
    const coverage = ((data.visitedCells / grid.cells.size) * 100).toLocaleString("cs-CZ", { maximumFractionDigits: 1 });

    const tiles = el("div", "dash-tiles");
    tiles.append(
      tile("Vstupů celkem", fmt(data.totalVisits)),
      tile("Navštívené hexagony", fmt(data.visitedCells), `${coverage} % z ${fmt(grid.cells.size)}`),
      tile("Na mapě", fmt(shown.length), `s ${data.minVisits} a více vstupy`),
    );
    const note = el(
      "p",
      "dash-muted dash-note",
      `Hexagony s méně než ${data.minVisits} ${visitsWord(data.minVisits)} se kvůli soukromí nezobrazují (v součtech jsou). ` +
        `${data.updatedAt ? `Poslední data: ${new Date(data.updatedAt).toLocaleString("cs-CZ")}. ` : ""}Obnovuje se každou minutu.`,
    );
    panel.replaceChildren(
      header(),
      tiles,
      legend(classBreaks),
      rankedTable(
        "Nejnavštěvovanější místa",
        shown.slice(0, TOP_N).map(([cell, n]) => ({ label: place(cell).name, value: n })),
        "Zatím žádný hexagon nedosáhl prahu pro zobrazení.",
      ),
      rankedTable(
        "Podle okresů",
        [...byDistrict].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: `okres ${label}`, value })),
        "Zatím bez dat.",
      ),
      note,
    );
  }

  // Feature state needs the grid's tiles to exist.
  if (!map.isSourceLoaded("heat")) await new Promise((resolve) => map.once("idle", resolve));
  await refresh();
  window.setInterval(() => void refresh(), REFRESH_MS);
});
