// Downloads lookout towers (rozhledny) and named peaks (vrcholy) in Plzeňský kraj from OpenStreetMap
// via the Overpass API and writes public/data/osm-pois.geojson.
// Source: © OpenStreetMap contributors, ODbL. Municipality names: ČÚZK RÚIAN (CC BY 4.0).
// Usage: node scripts/fetch-osm-pois.mjs
import { writeFile } from "node:fs/promises";
import { fetchMunicipalityLookup, inRing, loadRegionRings, metres } from "./lib.mjs";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const QUERY = `[out:json][timeout:90];
area["ISO3166-2"="CZ-32"]->.a;
(nwr["tower:type"="observation"](area.a);nwr["natural"="peak"]["name"](area.a););
out center tags;`;
const OUT = "public/data/osm-pois.geojson";

const rings = await loadRegionRings();
const inRegion = (pt) => rings.some((r) => inRing(pt, r));
const municipalityAt = await fetchMunicipalityLookup();

const res = await fetch(OVERPASS, {
  method: "POST",
  headers: { "User-Agent": "plzen-hex-hackathon/0.1", "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ data: QUERY }),
});
if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`);
const { elements } = await res.json();
console.log(`Overpass: ${elements.length} elements`);

const coords = (e) => (e.type === "node" ? [e.lon, e.lat] : [e.center.lon, e.center.lat]);
const parseEle = (s) => {
  const n = Number.parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
};

const towers = [];
const peaks = [];
for (const e of elements) {
  const t = e.tags ?? {};
  const pt = coords(e).map((c) => +c.toFixed(6));
  if (!inRegion(pt)) continue;
  const base = { id: `osm:${e.type}/${e.id}`, municipality: municipalityAt(pt) };

  if (t["tower:type"] === "observation") {
    if (/vojensk/i.test(t.name ?? "") || ["no", "private", "military"].includes(t.access)) continue;
    // Several towers are mapped twice (as a point and as a building outline): keep one, preferring a named one.
    const twin = towers.find((f) => metres(f.geometry.coordinates, pt) < 100);
    if (twin) {
      if (!twin.properties.named && t.name) twin.properties = { ...twin.properties, name: t.name, named: true };
      continue;
    }
    towers.push({
      type: "Feature",
      properties: { ...base, kind: "rozhledna", name: t.name ?? null, named: Boolean(t.name), ele: parseEle(t.ele) },
      geometry: { type: "Point", coordinates: pt },
    });
  } else if (t.natural === "peak" && t.name) {
    peaks.push({
      type: "Feature",
      properties: { ...base, kind: "vrchol", name: t.name, ele: parseEle(t.ele) },
      geometry: { type: "Point", coordinates: pt },
    });
  }
}

// Tower names: "Sedlo" → "rozhledna Sedlo", a church tower → "Kostel … (vyhlídková věž)",
// unnamed → "rozhledna, Kdyně".
for (const f of towers) {
  const p = f.properties;
  if (!p.name) p.name = p.municipality ? `rozhledna, ${p.municipality}` : "rozhledna";
  else if (/kostel/i.test(p.name)) p.name = `${p.name} (vyhlídková věž)`;
  else if (!/rozhledn|věž|vyhlídk/i.test(p.name)) p.name = `rozhledna ${p.name}`;
  delete p.named;
}

const features = [...towers, ...peaks];
await writeFile(OUT, JSON.stringify({ type: "FeatureCollection", features }));
const top = peaks.filter((f) => f.properties.ele !== null).sort((a, b) => b.properties.ele - a.properties.ele)[0];
console.log(`Wrote ${towers.length} lookout towers and ${peaks.length} peaks to ${OUT}`);
console.log(`Highest peak: ${top.properties.name} (${top.properties.ele} m)`);
