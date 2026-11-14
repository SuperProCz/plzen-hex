// Game logic on the real data: grid coverage, milestones, challenges, levels, journal replay.
// Run with `npm test` (tests/run.mjs bundles and executes it).
import { readFileSync } from "node:fs";
import { buildHexGrid } from "../src/hex/grid";
import { Progress } from "../src/stats/progress";
import { buildStats } from "../src/stats/definitions";
import { buildMilestones } from "../src/game/milestones";
import { replayJournal, Journal } from "../src/game/journal";
import { computeGameState } from "../src/game/state";
import { challengesFor } from "../src/game/challenges";
import { levelFor, xpForLevel, statsXp } from "../src/game/levels";
import { dayKey, shiftDay, plural } from "../src/game/time";
import { ringCentroid } from "../src/geo";

let failures = 0;
const check = (name: string, ok: boolean, info: unknown = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}`, ok ? "" : info); };
const load = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, "utf8"));
const region = load("plzensky-kraj.geojson"), monuments = load("pamatky.geojson"), places = load("obce.geojson"), pois = load("osm-pois.geojson");
const grid = buildHexGrid(region, monuments.features.map((f: any) => f.geometry.coordinates));
const fresh = () => new Progress(buildStats(grid, monuments, places, pois));
const milestones = buildMilestones({ grid, region, monuments, places, pois });

// --- static checks
check("all monuments/pois/places in grid", [...monuments.features, ...pois.features, ...places.features].every((f: any) => grid.cellAt(...f.geometry.coordinates)));
const ids = milestones.map((m: any) => m.id);
check("milestones unique ids", new Set(ids).size === ids.length, ids);
check("expected milestones present", ["extreme-north", "extreme-south", "extreme-west", "extreme-east", "centre", "plzen", "highest-peak", "brewery"].every((i) => ids.includes(i)), ids);
const rings = region.features[0].geometry.coordinates;
const inRing = ([x, y]: number[], r: number[][]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const centre = ringCentroid(rings[0]);
check("centroid inside region", inRing(centre, rings[0]), centre);
for (const m of milestones.filter((m: any) => m.target)) console.log(`   ${m.icon} ${m.title}: ${m.target.map((v: number) => v.toFixed(4)).join(", ")}`);
console.log("   highest:", milestones.find((m: any) => m.id === "highest-peak").description);

// challenges: deterministic, 3 distinct, first is hex
for (const d of ["2026-11-13", "2026-11-14", "2027-01-01"]) {
  const a = challengesFor(d).map((c: any) => c.id), b = challengesFor(d).map((c: any) => c.id);
  check(`challenges ${d} deterministic & distinct (${a.join(", ")})`, a.join() === b.join() && new Set(a).size === 3 && a[0].startsWith("hexes-"));
}
const variety = new Set<string>(); let day = "2026-01-01";
for (let i = 0; i < 365; i++) { challengesFor(day).forEach((c: any) => variety.add(c.id)); day = shiftDay(day, 1); }
check("all 15 challenge types appear over a year", variety.size === 15, variety.size);

// time helpers
check("shiftDay across month/DST", shiftDay("2026-10-24", 1) === "2026-10-25" && shiftDay("2026-10-25", 1) === "2026-10-26" && shiftDay("2026-03-31", 1) === "2026-04-01" && shiftDay("2026-01-01", -1) === "2025-12-31");
check("plural", plural(1, "den", "dny", "dní") === "den" && plural(3, "den", "dny", "dní") === "dny" && plural(5, "den", "dny", "dní") === "dní" && plural(0, "den", "dny", "dní") === "dní");
check("levels", levelFor(0) === 1 && levelFor(99) === 1 && levelFor(100) === 2 && levelFor(299) === 2 && levelFor(300) === 3 && xpForLevel(5) === 1000);

// --- simulated trip: Sat 2026-11-07 06:10 Plzeň square, brewery; Sun around Plzeň; Mon Klatovy
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`).getTime();
const plzen = [13.3776, 49.7475], brewery = monuments.features.find((f: any) => /Prazdroj/.test(f.properties.name)).geometry.coordinates;
const steps: [number[], number][] = [
  [plzen, at("2026-11-07", "06:10")],
  [brewery, at("2026-11-07", "09:00")],
  [[13.40, 49.76], at("2026-11-07", "10:00")],
  [[13.47, 49.69], at("2026-11-07", "11:00")],
  [[13.36, 49.72], at("2026-11-07", "12:00")],
  [[13.30, 49.70], at("2026-11-08", "14:00")],
  [[13.2952, 49.3955], at("2026-11-09", "23:30")],
];
const progress = fresh();
const journal = new Journal();
let prevXp = 0; const unlocked: [string, number][] = [];
for (const [p, t] of steps) {
  const cell = grid.cellAt(p[0], p[1]);
  if (journal.cellTime.has(cell)) { console.log("   (duplicate cell skipped)", p); continue; }
  journal.add({ cell, time: t, found: progress.unlock(cell) });
  unlocked.push([cell, t]);
  const s = computeGameState(journal, progress.summary(), milestones);
  check(`XP non-decreasing after ${dayKey(t)} ${new Date(t).getHours()}h (xp=${s.xp}, level ${s.level} ${s.levelTitle})`, s.xp >= prevXp);
  prevXp = s.xp;
}
const st = computeGameState(journal, progress.summary(), milestones);
const done = (id: string) => st.milestones.find((m: any) => m.milestone.id === id).status;
check("first-step done at first unlock", done("first-step").done && done("first-step").time === steps[0][1]);
check("plzen milestone", done("plzen").done);
check("brewery milestone", done("brewery").done && done("brewery").time === steps[1][1]);
check("early bird (06:10)", done("early-bird").done && done("early-bird").time === steps[0][1]);
check("night owl (23:30)", done("night-owl").done);
check("weekend Sat+Sun", done("weekend").done && done("weekend").time === steps[5][1]);
check("day-5 on Saturday", done("day-5").done && done("day-5").time === steps[4][1], done("day-5"));
check("streak-3 reached Monday", done("streak-3").done && done("streak-3").time === steps[6][1], done("streak-3"));
check("streak-7 not done", !done("streak-7").done);
check("extremes not done", !done("extreme-south").done && !done("all-directions").done);
check("level-progress within span", st.levelProgress >= 0 && st.levelProgress < st.levelSpan);

// replay from storage order (shuffled) gives identical state
const shuffled = [...unlocked].reverse() as [string, number | null][];
const p2 = fresh(); const j2 = replayJournal(shuffled, p2);
const st3 = computeGameState(j2, p2.summary(), milestones);
check("replay == incremental (xp)", st3.xp === st.xp, [st3.xp, st.xp]);
check("replay == incremental (milestone times)", JSON.stringify(st3.milestones.map((m: any) => m.status)) === JSON.stringify(st.milestones.map((m: any) => m.status)));
check("replay found lists identical", JSON.stringify(j2.entries.map((e: any) => e.found.map((d: any) => d.stat.id + d.item.name))) === JSON.stringify(journal.entries.map((e: any) => e.found.map((d: any) => d.stat.id + d.item.name))));

// legacy untimed entries
const p4 = fresh(); const j4 = replayJournal([[unlocked[0][0], null], [unlocked[1][0], null]], p4);
const st4 = computeGameState(j4, p4.summary(), milestones);
const d4 = (id: string) => st4.milestones.find((m: any) => m.milestone.id === id).status;
check("legacy: first-step done with unknown time", d4("first-step").done && d4("first-step").time === null);
check("legacy: no time-based milestones", !d4("early-bird").done && !d4("weekend").done && st4.streak === 0);

// all-directions: unlock the 4 extremes
const p5 = fresh(); const j5 = new Journal(); let t5 = at("2026-11-10", "12:00");
for (const id of ["extreme-north", "extreme-south", "extreme-west", "extreme-east"]) {
  const m = milestones.find((x: any) => x.id === id); const cell = grid.cellAt(m.target[0], m.target[1]);
  j5.add({ cell, time: (t5 += 1000), found: p5.unlock(cell) });
}
const st5 = computeGameState(j5, p5.summary(), milestones);
check("all-directions after 4 extremes", st5.milestones.find((m: any) => m.milestone.id === "all-directions").status.done);

// complete municipality: municipality with >=3 parts
const byMun = new Map<number, any[]>(); for (const f of places.features) byMun.set(f.properties.municipalityId, [...(byMun.get(f.properties.municipalityId) ?? []), f]);
const [, parts] = [...byMun].find(([, v]) => v.length >= 3)!;
const p6 = fresh(); const j6 = new Journal(); let t6 = at("2026-11-11", "12:00");
for (const f of parts) { const cell = grid.cellAt(...f.geometry.coordinates); if (!j6.cellTime.has(cell)) j6.add({ cell, time: (t6 += 1000), found: p6.unlock(cell) }); }
const st6 = computeGameState(j6, p6.summary(), milestones);
check(`complete-municipality (${parts[0].properties.municipality}, ${parts.length} parts)`, st6.milestones.find((m: any) => m.milestone.id === "complete-municipality").status.done);

// max XP sanity: unlock everything
const p7 = fresh(); for (const c of grid.cells) p7.unlock(c);
console.log("   XP from stats if everything is unlocked:", statsXp(p7.summary()), "→ level", levelFor(statsXp(p7.summary())));
check("all stats complete when every cell unlocked", p7.summary().every((s: any) => s.visited === s.total));

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
