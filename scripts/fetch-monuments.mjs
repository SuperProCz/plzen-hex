// Downloads cultural monuments (kulturní památky) in Plzeňský kraj from the NPÚ geoportal
// and writes a slim GeoJSON to public/data/pamatky.geojson.
// Source: Národní památkový ústav (NPÚ), Ústřední seznam kulturních památek, CC BY 4.0.
// Municipality names: ČÚZK RÚIAN (CC BY 4.0).
// Usage: node scripts/fetch-monuments.mjs
import { writeFile } from "node:fs/promises";
import { bboxQuery, fetchLayer, fetchMunicipalityLookup, inRing, loadRegionRings, metres } from "./lib.mjs";

const LAYERS = [
  // KP – main definition point
  { url: "https://geoportal.npu.cz/arcgis/rest/services/Tematicke/CP_PaKaOchreKP/MapServer/0", nkp: false },
  // NKP (národní kulturní památka) – main definition point
  { url: "https://geoportal.npu.cz/arcgis/rest/services/Tematicke/CP_UAP_BI/MapServer/2", nkp: true },
];
/**
 * Monument types that aren't worth a visit as a tourist: ordinary houses, farm buildings,
 * rectories, offices, schools, small wayside crosses, boundary stones… Matched against the start of the name.
 */
const NON_TOURISTIC = [
  /^(před)?městsk(ý|á) (dům|dvojdům|usedlost)/,
  /^venkovsk(ý|á) (dům|dvojdům|usedlost)/,
  /^(předměstská|venkovská) usedlost/,
  /^činžovní dům/,
  /^(úřednický|panský|dělnický) dům/,
  /^dům( |$)/,
  /^dům sociální péče/,
  /^obytná budova/,
  /^(správní )?budova/,
  /^(bývalá )?sýpka/,
  /^stodola/,
  /^(arci)?děkanství/,
  /^(fara|proboštství)/,
  /^(hospodářský|zemědělský|panský|královácký) dvůr/,
  /^bývalý dvorec/,
  /^brána/,
  /^ohradní/,
  /^průjezdní kolna/,
  /^portál/,
  /^kovárna/,
  /^(bývalá |mateřská |masarykova |benešova )?škola/,
  /^bývalá (obecná|c\. k\.)/,
  /^spořitelna/,
  /^(stará )?pošta/,
  /^rychta/,
  /^hraniční (kámen|sloup)/,
  /^(rýžoviště - )?sejpy/,
  /^silniční most/,
  /^věžový vodojem/,
  /^boží muka/,
  /^pamětní kříž/,
  /^krucifix/,
  /^výklenková kaplička/,
  /^(bývalá )?lesovna/,
  /^bývalý panský lesní úřad/,
  /^důchodní úřad/,
  /^myslivna/,
  /^bývalé ředitelství/,
  /^bývalá rybárna/,
];
/**
 * Overrides NON_TOURISTIC: museums and open-air folk architecture exhibits ("transfer z …"),
 * houses with Mikoláš Aleš sgraffiti, birthplaces, buildings that were once a church/fort/castle.
 */
const TOURISTIC_ANYWAY = /muzeum|expozice|transfer|sgrafit|rodný dům|mrakodrap|kostel|tvrz|(^|[^\p{L}])hrad|věží/u;
/** Individual monuments (by ÚSKP number) kept even though a NON_TOURISTIC rule matches them, with their map name. */
const ALWAYS_KEEP = new Map([["100322", "Budova býv. II. české státní reálky, dnes gymnázium"]]);
const isTouristic = (name, kind, nkp) => {
  const n = name.trim().toLowerCase();
  return nkp || TOURISTIC_ANYWAY.test(`${n} ${kind.toLowerCase()}`) || !NON_TOURISTIC.some((re) => re.test(n));
};
/** Stat categories, first match wins. The name is tried first, then the object type (kind). */
const CATEGORIES = [
  ["klaster", /klášter|loreta/],
  ["hrad", /zřícenina hradu|(^|[^\p{L}])hrad( |$|u )|^hrádek/u],
  ["archeologie", /hradiště|mohyl|sídliště|pohřebiště|tvrziště|valy/],
  ["tvrz", /tvrz/],
  ["zamek", /zámek|zámeč|zámk/],
  ["zidovske", /synagog|židovsk/],
  ["kostel", /kostel|chrám/],
  ["kaple", /kaple|kaplič|zvonice|zvonič/],
  ["sochy", /^(socha|sousoší|soubor soch)|sloup|pomník|kašna|kříž|smírčí/],
  ["technicke", /mlýn|hamr|pivovar|továrn|elektrárn|železni|most|huť|sklárn|vodárn|pila/],
];
const matchCategory = (text) => CATEGORIES.find(([, re]) => re.test(text.trim().toLowerCase()))?.[0];
const categoryOf = (name, kind) => matchCategory(name) ?? matchCategory(kind) ?? "ostatni";
const OUT = "public/data/pamatky.geojson";

const rings = await loadRegionRings();
const inRegion = (pt) => rings.some((r) => inRing(pt, r));

const municipalityAt = await fetchMunicipalityLookup();

const byId = new Map();
for (const layer of LAYERS) {
  const features = await fetchLayer(layer.url, {
    ...bboxQuery,
    where: "chraneno = 1",
    outFields: "rejstrikoveCisloUSKP,NazevPrvku,NazevPrStavu",
    orderByFields: "OBJECTID",
  });
  console.log(`${layer.url.split("/services/")[1]}: ${features.length} in bbox`);
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    const p = f.properties;
    if (!inRegion([lng, lat]) || (!ALWAYS_KEEP.has(p.rejstrikoveCisloUSKP) && !isTouristic(p.NazevPrvku, p.NazevPrStavu ?? "", layer.nkp)))
      continue;
    const id = p.rejstrikoveCisloUSKP;
    const prev = byId.get(id);
    byId.set(id, {
      type: "Feature",
      properties: {
        id,
        name: ALWAYS_KEEP.get(id) ?? p.NazevPrvku,
        kind: p.NazevPrStavu?.replace(/\s+/g, " "),
        nkp: layer.nkp || prev?.properties.nkp || false,
        category: categoryOf(p.NazevPrvku, p.NazevPrStavu ?? ""),
        municipality: municipalityAt([lng, lat]),
      },
      geometry: { type: "Point", coordinates: [+lng.toFixed(6), +lat.toFixed(6)] },
    });
  }
}

// The NKP layer repeats monuments that are also in the KP layer under a different register number.
// Merge each NKP into a KP point of the same category at (almost) the same spot.
for (const [id, nkp] of byId) {
  if (!nkp.properties.nkp) continue;
  const twin = [...byId.values()].find(
    (f) =>
      !f.properties.nkp &&
      f.properties.category === nkp.properties.category &&
      metres(f.geometry.coordinates, nkp.geometry.coordinates) < 30,
  );
  if (twin) {
    twin.properties.nkp = true;
    byId.delete(id);
  }
}

// Generic names ("radnice", "kaple") or names shared by several monuments get the municipality
// appended, e.g. "radnice, Plzeň". Names that are already specific ("hrad Švihov") stay as they are.
const features = [...byId.values()];
const nameCount = new Map();
for (const f of features) nameCount.set(f.properties.name, (nameCount.get(f.properties.name) ?? 0) + 1);
const isGeneric = (name) => nameCount.get(name) > 1 || !/\p{Lu}/u.test(name);
for (const f of features) {
  const { name, municipality } = f.properties;
  if (municipality && isGeneric(name) && !name.includes(municipality)) f.properties.name = `${name}, ${municipality}`;
}

const out = { type: "FeatureCollection", features };
await writeFile(OUT, JSON.stringify(out));
const nkp = out.features.filter((f) => f.properties.nkp).length;
console.log(`Wrote ${out.features.length} monuments (${nkp} NKP) to ${OUT}`);
const perCategory = {};
for (const f of features) perCategory[f.properties.category] = (perCategory[f.properties.category] ?? 0) + 1;
console.log(perCategory);
