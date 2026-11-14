// Finds a photo for each monument on Wikidata/Wikimedia Commons and writes public/data/images.json.
// Monuments are matched exactly by their ÚSKP register number (Wikidata property P762).
// For each photo the Commons author and licence are stored, because the app must credit them.
// Usage: node scripts/fetch-images.mjs   (needs public/data/pamatky.geojson)
import { readFile, writeFile } from "node:fs/promises";

const UA = "plzen-hex-hackathon/0.1 (open data hackathon project)";
const OUT = "public/data/images.json";

const monuments = JSON.parse(await readFile("public/data/pamatky.geojson", "utf8")).features;
const wanted = new Set(monuments.map((f) => f.properties.id));

const sparql = `SELECT ?id ?image ?article WHERE {
  ?item wdt:P762 ?id; wdt:P18 ?image.
  OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://cs.wikipedia.org/>. }
}`;
const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}`, {
  headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
});
if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`);
const rows = (await res.json()).results.bindings;
console.log(`Wikidata: ${rows.length} heritage items with a photo`);

// First photo per monument; the file name is the last path segment of the Special:FilePath URL.
const byId = new Map();
for (const r of rows) {
  const id = r.id.value;
  if (!wanted.has(id) || byId.has(id)) continue;
  const file = decodeURIComponent(r.image.value.split("/Special:FilePath/")[1]);
  const wiki = r.article ? decodeURIComponent(r.article.value.split("/wiki/")[1]) : undefined;
  byId.set(id, { file, wiki });
}
console.log(`Matched ${byId.size} of ${wanted.size} monuments`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** GET with polite pacing; on HTTP 429 waits as long as the server asks (or 10 s) and retries. */
async function politeGet(url, attempt = 1) {
  await sleep(1000);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (r.status === 429 && attempt <= 5) {
    const wait = Number(r.headers.get("retry-after")) || 10;
    console.log(`  rate limited, waiting ${wait} s`);
    await sleep(wait * 1000);
    return politeGet(url, attempt + 1);
  }
  if (!r.ok) throw new Error(`Commons: HTTP ${r.status}`);
  return r.json();
}

// Author and licence from Commons, 50 files per request.
const stripHtml = (s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const files = [...new Set([...byId.values()].map((v) => v.file))];
const meta = new Map();
for (let i = 0; i < files.length; i += 50) {
  const titles = files.slice(i, i + 50).map((f) => `File:${f}`).join("|");
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo" +
    `&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName&titles=${encodeURIComponent(titles)}`;
  const data = await politeGet(url);
  const normalized = new Map((data.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const page of data.query.pages) {
    const ext = page.imageinfo?.[0]?.extmetadata;
    if (!ext) continue;
    const title = normalized.get(page.title) ?? page.title;
    meta.set(title.replace(/^File:/, ""), {
      author: stripHtml(ext.Artist?.value ?? "") || "neznámý autor",
      license: stripHtml(ext.LicenseShortName?.value ?? ""),
    });
  }
}

// Keep only photos whose licence we know, so every shown image can be credited.
const out = {};
for (const [id, v] of byId) {
  const m = meta.get(v.file);
  if (!m?.license) continue;
  out[id] = { file: v.file, author: m.author.slice(0, 120), license: m.license, ...(v.wiki ? { wiki: v.wiki } : {}) };
}
await writeFile(OUT, JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} photos with author and licence to ${OUT}`);
