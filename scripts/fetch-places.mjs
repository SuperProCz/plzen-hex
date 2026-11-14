// Downloads municipalities (obce) and their parts (části obce = towns, villages, hamlets)
// in Plzeňský kraj from ČÚZK RÚIAN and writes public/data/obce.geojson.
// Each feature is the definition point (centre) of one část obce. Source: ČÚZK RÚIAN, CC BY 4.0.
// Usage: node scripts/fetch-places.mjs
import { writeFile } from "node:fs/promises";
import { fetchLayer } from "./lib.mjs";

const RUIAN = "https://ags.cuzk.gov.cz/arcgis/rest/services/RUIAN/Prohlizeci_sluzba_nad_daty_RUIAN/MapServer";
const OUT = "public/data/obce.geojson";

/** Districts (okresy) of Plzeňský kraj, RÚIAN codes. */
const DISTRICTS = {
  3401: "Domažlice",
  3404: "Klatovy",
  3405: "Plzeň-město",
  3406: "Plzeň-jih",
  3407: "Plzeň-sever",
  3408: "Rokycany",
  3410: "Tachov",
};
/** RÚIAN status obce → our municipality type. */
const STATUS = { 2: "obec", 3: "mesto", 4: "mesto", 6: "mestys" };

const municipalities = await fetchLayer(`${RUIAN}/12`, {
  where: `okres IN (${Object.keys(DISTRICTS).join(",")})`,
  outFields: "kod,nazev,statuskod,okres",
  orderByFields: "kod",
  returnGeometry: "false",
});
const byCode = new Map(municipalities.map((m) => [m.properties.kod, m.properties]));
console.log(`obce: ${municipalities.length}`);

const parts = [];
const codes = [...byCode.keys()];
for (let i = 0; i < codes.length; i += 100) {
  parts.push(
    ...(await fetchLayer(`${RUIAN}/11`, {
      where: `obec IN (${codes.slice(i, i + 100).join(",")})`,
      outFields: "kod,nazev,obec",
      orderByFields: "kod",
    })),
  );
}
console.log(`části obcí: ${parts.length}`);

// Pick the part that represents the municipality's centre: the one with the same name,
// else the historic core ("Vnitřní Město", "Město", "Střed", "Klatovy I"), else the first part.
const centreRank = (partName, municipalityName) =>
  partName === municipalityName ? 0
  : ["Vnitřní Město", "Město", "Střed", `${municipalityName} I`].includes(partName) ? 1
  : 2;
const mainPart = new Map();
for (const p of parts) {
  const m = byCode.get(p.properties.obec);
  const rank = centreRank(p.properties.nazev, m.nazev);
  const best = mainPart.get(m.kod);
  if (!best || rank < best.rank) mainPart.set(m.kod, { rank, kod: p.properties.kod });
}

const features = parts.map((p) => {
  const m = byCode.get(p.properties.obec);
  const [lng, lat] = p.geometry.coordinates;
  return {
    type: "Feature",
    properties: {
      name: p.properties.nazev,
      municipality: m.nazev,
      municipalityId: m.kod,
      type: STATUS[m.statuskod] ?? "obec",
      district: DISTRICTS[m.okres],
      /** True for the main part = the point that represents the whole municipality. */
      main: mainPart.get(m.kod).kod === p.properties.kod,
    },
    geometry: { type: "Point", coordinates: [+lng.toFixed(6), +lat.toFixed(6)] },
  };
});

await writeFile(OUT, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`Wrote ${features.length} places (${mainPart.size} municipalities) to ${OUT}`);
