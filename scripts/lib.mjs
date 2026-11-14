// Shared helpers for the data-fetching scripts.
import { readFile } from "node:fs/promises";

/** Bounding box of Plzeňský kraj (lon/lat). */
export const BBOX = "12.40,48.94,13.85,50.11";
const PAGE = 2000;

export async function loadRegionRings() {
  const region = JSON.parse(await readFile("public/data/plzensky-kraj.geojson", "utf8"));
  return region.features.flatMap((f) =>
    f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]),
  );
}

export function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd test over every ring, so holes and multipolygons work. */
export function inGeometry(pt, geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polys.flat().filter((ring) => inRing(pt, ring)).length % 2 === 1;
}

/** Pages through an ArcGIS MapServer layer query and returns all GeoJSON features (WGS84). */
export async function fetchLayer(url, query) {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      outSR: "4326",
      ...query,
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      f: "geojson",
    });
    const res = await fetch(`${url}/query?${params}`);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const page = await res.json();
    if (page.error) throw new Error(`${url}: ${JSON.stringify(page.error)}`);
    all.push(...page.features);
    if (page.features.length < PAGE && !page.exceededTransferLimit) break;
  }
  return all;
}

/** Bounding-box filter for fetchLayer queries. */
export const bboxQuery = {
  geometry: BBOX,
  geometryType: "esriGeometryEnvelope",
  inSR: "4326",
  spatialRel: "esriSpatialRelIntersects",
};

const RUIAN_MUNICIPALITIES =
  "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer/12";

/** Municipality polygons around the region and a lookup "which municipality is this point in". */
export async function fetchMunicipalityLookup() {
  const municipalities = await fetchLayer(RUIAN_MUNICIPALITIES, {
    ...bboxQuery,
    where: "1=1",
    outFields: "nazev",
    orderByFields: "objectid",
    maxAllowableOffset: "0.0003",
  });
  console.log(`RÚIAN obce: ${municipalities.length} in bbox`);
  return (pt) => municipalities.find((m) => inGeometry(pt, m.geometry))?.properties.nazev ?? null;
}

/** Rough distance in metres between two lon/lat points (fine at this latitude and scale). */
export const metres = ([x1, y1], [x2, y2]) => Math.hypot((x1 - x2) * 72_000, (y1 - y2) * 111_000);
