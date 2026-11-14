import "./style.css";
import { createMap } from "./map/createMap";
import { addRegionLayer } from "./map/regionLayer";
import { addHexLayer, setCurrentHex, setHexUnlocked } from "./map/hexLayer";
import { addMonumentsLayer } from "./map/monumentsLayer";
import { addPoiLayer } from "./map/poiLayer";
import { addMilestoneMarkers } from "./map/milestoneMarkers";
import { createUserMarker } from "./map/userMarker";
import { loadRegionBoundary } from "./data/region";
import { loadMonuments } from "./data/monuments";
import { loadPlaces } from "./data/places";
import { loadPois, poiLabel } from "./data/pois";
import { makePlaceNamer } from "./data/placeNamer";
import { loadMonumentPhotos } from "./data/photos";
import { buildHexGrid } from "./hex/grid";
import { UnlockStore } from "./state/unlocks";
import { Progress, type Discovery } from "./stats/progress";
import { buildStats } from "./stats/definitions";
import { currentTier, tierLabel, TIERS } from "./stats/tiers";
import { replayJournal } from "./game/journal";
import { buildMilestones } from "./game/milestones";
import { computeGameState, type GameState } from "./game/state";
import { startTracking, type Fix } from "./location/tracker";
import { createStatusPanel } from "./ui/statusPanel";
import { createHomeScreen, type JournalItem } from "./ui/homeScreen";
import { CELEBRATION_RANK, showCelebrations, type Celebration } from "./ui/celebrations";
import { initSfx, playCelebration, playUnlock } from "./ui/sfx";
import { tierTitle } from "./ui/statsView";
import { directionArrow, distanceM, formatDistance } from "./geo";
import { VisitReporter } from "./analytics/visits";
import { ANALYTICS_URL, UNLOCK_MAX_ACCURACY_M } from "./config";

const JOURNAL_LENGTH = 30;
const MAX_CELEBRATIONS = 5;

const map = createMap("map");
const unlocks = new UnlockStore();
const visits = new VisitReporter(ANALYTICS_URL);
initSfx();

// The home screen shows first; its button is enabled once the data has loaded and these are wired up.
let startTrip = () => {};
let showOnMap = (_target: [number, number]) => {};
const home = createHomeScreen({
  onStart: () => startTrip(),
  onShowOnMap: (target) => showOnMap(target),
  onReset: () => {
    unlocks.clear();
    location.reload();
  },
  analytics: {
    available: visits.available,
    isEnabled: () => visits.enabled,
    setEnabled: (on) => visits.setEnabled(on),
  },
});

/** Unique names of what an unlock discovered, for the given stat groups. */
function namesIn(found: Discovery[], groups: string[]): string[] {
  return [...new Set(found.filter((d) => groups.includes(d.stat.group)).map((d) => d.item.name))];
}

/** "Navštíveno: Šťáhlavy" / "Objeveno: zámek Kozel, …" lines for the unlock toast. */
function describeDiscoveries(found: Discovery[]): string[] {
  const line = (prefix: string, list: string[]) =>
    list.length ? [`${prefix}: ${list.slice(0, 3).join(" · ")}${list.length > 3 ? ` a ${list.length - 3} dalších` : ""}`] : [];
  return [...line("Navštíveno", namesIn(found, ["places"])), ...line("Objeveno", namesIn(found, ["monuments", "nature"]))];
}

/** Everything worth celebrating that changed between two game states, most important first. */
function celebrationsBetween(before: GameState, after: GameState): Celebration[] {
  const list: Celebration[] = [];
  const rank = (t: ReturnType<typeof currentTier>) => (t ? TIERS.findIndex((x) => x.tier === t) : -1);

  if (after.level > before.level) {
    list.push({
      kind: "level",
      kicker: "Nová úroveň!",
      title: `Úroveň ${after.level} · ${after.levelTitle}`,
      subtitle: `${after.xp.toLocaleString("cs-CZ")} XP`,
      icon: String(after.level),
    });
  }
  after.stats.forEach((s, i) => {
    const tier = currentTier(s.visited, s.total);
    const prev = currentTier(before.stats[i].visited, before.stats[i].total);
    if (tier && rank(tier) > rank(prev)) {
      list.push({
        kind: tier,
        kicker: `Nový odznak · ${tierLabel(tier)}`,
        title: tierTitle(s, tier),
        subtitle: `${s.label} · ${s.visited.toLocaleString("cs-CZ")} / ${s.total.toLocaleString("cs-CZ")}`,
      });
    }
  });
  after.milestones.forEach(({ milestone, status }, i) => {
    if (status.done && !before.milestones[i].status.done) {
      list.push({
        kind: "milestone",
        kicker: "Milník splněn!",
        title: milestone.title,
        subtitle: `+${milestone.xp} XP`,
        icon: milestone.icon,
      });
    }
  });
  for (const c of after.challenges) {
    // Matched by id: if the day rolled over, yesterday's challenges simply don't match.
    const prev = before.challenges.find((b) => b.challenge.id === c.challenge.id);
    if (c.done && prev && !prev.done) {
      list.push({
        kind: "challenge",
        kicker: "Denní výzva splněna!",
        title: c.challenge.text,
        subtitle: `+${c.challenge.xp} XP`,
        icon: "✓",
      });
    }
  }
  return list.sort((a, b) => CELEBRATION_RANK.indexOf(a.kind) - CELEBRATION_RANK.indexOf(b.kind));
}

map.on("load", async () => {
  let data;
  try {
    data = await Promise.all([loadRegionBoundary(), loadMonuments(), loadPlaces(), loadPois(), loadMonumentPhotos()]);
  } catch (err) {
    console.error(err);
    home.showError("Nepodařilo se načíst data. Zkontroluj připojení k internetu a obnov stránku.");
    return;
  }
  const [region, monuments, places, pois, photos] = data;

  const grid = buildHexGrid(
    region,
    monuments.features.map((f) => f.geometry.coordinates as [number, number]),
  );
  const progress = new Progress(buildStats(grid, monuments, places, pois));
  const milestones = buildMilestones({ grid, region, monuments, places, pois });
  // Cells from a differently built grid can't be shown or counted; skip them.
  const journal = replayJournal(
    unlocks.entries().filter(([cell]) => grid.cells.has(cell)),
    progress,
  );

  addRegionLayer(map, region);
  addHexLayer(map, grid, "region-outline");
  const markMonuments = addMonumentsLayer(map, monuments, photos);
  const markPois = addPoiLayer(map, pois);
  for (const entry of journal.entries) setHexUnlocked(map, entry.cell);

  const cellOf = (coords: number[]) => grid.cellAt(coords[0], coords[1]) ?? "";
  const monumentCell = new Map(monuments.features.map((f) => [f.properties.id, cellOf(f.geometry.coordinates)]));
  const poiCell = new Map(pois.features.map((f) => [f.properties.id, cellOf(f.geometry.coordinates)]));
  const isUnlocked = (cell: string | undefined) => !!cell && journal.cellTime.has(cell);

  // Journal: label each cell by the nearest town/village centre.
  const nameAt = makePlaceNamer(places);
  const placeNameCache = new Map<string, string>();
  const placeNear = (cell: string): string => {
    let name = placeNameCache.get(cell);
    if (!name) placeNameCache.set(cell, (name = nameAt(grid.centre(cell)).name));
    return name;
  };
  const journalItems = (): JournalItem[] =>
    journal.entries
      .slice(-JOURNAL_LENGTH)
      .reverse()
      .map((e) => ({
        time: e.time,
        place: placeNear(e.cell),
        found: namesIn(e.found, ["places", "monuments", "nature"]),
      }));

  // Candidates for the "nearest goal" hint: castles, chateaux, monasteries, NKP, lookout towers, milestone places.
  const goalCandidates = [
    ...monuments.features
      .filter((f) => f.properties.nkp || ["hrad", "zamek", "klaster"].includes(f.properties.category))
      .map((f) => ({ name: f.properties.name, coords: f.geometry.coordinates, cell: monumentCell.get(f.properties.id) })),
    ...pois.features
      .filter((f) => f.properties.kind === "rozhledna")
      .map((f) => ({ name: poiLabel(f.properties), coords: f.geometry.coordinates, cell: poiCell.get(f.properties.id) })),
    ...milestones
      .filter((m) => m.target)
      .map((m) => ({ name: `🏁 ${m.title}`, coords: m.target!, cell: cellOf(m.target!) })),
  ];

  let state = computeGameState(journal, progress.summary(), milestones);
  const updateMilestoneMarkers = addMilestoneMarkers(map, state);
  const userMarker = createUserMarker(map);
  let lastFix: Fix | null = null;

  let stopTracking: (() => void) | null = null;
  const track = () => {
    stopTracking?.();
    stopTracking = startTracking(handleFix, (s) => panel.setLocation(s));
  };
  const panel = createStatusPanel({
    onRetry: track,
    onHome: () => {
      // Recompute so a new day's challenges and the streak are current.
      state = computeGameState(journal, progress.summary(), milestones);
      render();
      home.show();
    },
  });

  function updateGoal(): void {
    const from = lastFix ? [lastFix.lng, lastFix.lat] : map.getCenter().toArray();
    let goal: (typeof goalCandidates)[number] | null = null;
    let goalDistance = Infinity;
    for (const g of goalCandidates) {
      if (isUnlocked(g.cell)) continue;
      const d = distanceM(from, g.coords);
      if (d < goalDistance) [goal, goalDistance] = [g, d];
    }
    if (!goal) return panel.setGoal(null);
    const target = goal.coords as [number, number];
    panel.setGoal({
      text: `Nejbližší cíl: ${goal.name} · ${formatDistance(goalDistance)} ${directionArrow(from, target)}`,
      onClick: () => map.flyTo({ center: target, zoom: Math.max(map.getZoom(), 13) }),
    });
  }

  function render(): void {
    panel.render(state);
    home.render(state, journalItems());
    updateMilestoneMarkers(state);
    markMonuments((id) => isUnlocked(monumentCell.get(id)));
    markPois((id) => isUnlocked(poiCell.get(id)));
    updateGoal();
  }
  render();
  map.on("moveend", () => {
    if (!lastFix) updateGoal();
  });

  // GPS starts on the first "Začít výlet" (so the permission prompt follows a tap), then keeps running.
  let centreOnNextFix = false;
  startTrip = () => {
    home.hide();
    if (!stopTracking) {
      centreOnNextFix = true;
      track();
    }
  };
  showOnMap = (target) => {
    home.hide();
    map.flyTo({ center: target, zoom: 13 });
  };

  function handleFix(fix: Fix): void {
    lastFix = fix;
    userMarker.move(fix.lng, fix.lat);
    if (centreOnNextFix) {
      centreOnNextFix = false;
      map.easeTo({ center: [fix.lng, fix.lat], zoom: Math.max(map.getZoom(), 12) });
    }
    const cell = grid.cellAt(fix.lng, fix.lat);

    if (!cell) {
      setCurrentHex(map, null);
      panel.setLocation("outside");
      updateGoal();
      return;
    }
    setCurrentHex(map, cell);

    if (fix.accuracy > UNLOCK_MAX_ACCURACY_M) {
      panel.setLocation("inaccurate", `±${Math.round(fix.accuracy)} m`);
      updateGoal();
      return;
    }
    panel.setLocation("tracking", `±${Math.round(fix.accuracy)} m`);
    visits.record(cell);

    const time = Date.now();
    if (!unlocks.unlock(cell, time)) {
      updateGoal();
      return;
    }
    const before = state;
    const found = progress.unlock(cell);
    journal.add({ cell, time, found });
    setHexUnlocked(map, cell);
    state = computeGameState(journal, progress.summary(), milestones);
    render();

    userMarker.pulse();
    panel.toast("Nový hexagon odemčen!", describeDiscoveries(found));
    const celebrations = celebrationsBetween(before, state);
    if (celebrations.length) {
      showCelebrations(celebrations.slice(0, MAX_CELEBRATIONS));
      playCelebration(celebrations[0].kind);
    } else {
      playUnlock();
    }
  }

  // Dev only: Alt/Option+click on the map simulates a GPS fix there.
  if (import.meta.env.DEV) {
    map.on("click", (e) => {
      if (!e.originalEvent.altKey) return;
      handleFix({ lng: e.lngLat.lng, lat: e.lngLat.lat, accuracy: 10, timestamp: Date.now() });
    });
  }
});
