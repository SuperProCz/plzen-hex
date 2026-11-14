# Plzeň Hex

**Live:** https://92-5-185-123.sslip.io/ (game) · https://92-5-185-123.sslip.io/dashboard/ (visit heatmap)

A web app for tourism in the Plzeň Region (Plzeňský kraj). The region is split into hexagons that you unlock by visiting them with GPS, and open data adds facts and statistics about each place.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run dev:phone  # HTTPS on your LAN IP, to test real GPS on a phone (accept the self-signed cert)
npm run build      # type-check + production build into dist/
npm test           # game logic, visit reporter and server validation tests (tests/, server/)
```

## Anonymous visit statistics

The app counts how many times players **enter** each grid cell and sends those counts to the server (`server/`). The region can then see which places people actually visit.

- **Client** (`src/analytics/visits.ts`): on each accurate GPS fix, entering a different cell adds 1 to that cell's count. Re-entering the same cell within 10 minutes (GPS jitter on an edge) doesn't count. Counts are queued in localStorage and sent as `POST {"visits": {"<cell>": <count>}}`: on every new entry, every 60 s, when the device comes back online, and when the app goes to the background. They're removed from the queue only after the server accepts them. No user ID, position or time is sent. Players can opt out on the home screen, which also discards anything not sent yet. In `npm run dev` nothing is sent unless `VITE_ANALYTICS_URL` is set, so Alt+click test visits never reach the real data.
- **Server** (`server/`): a Node.js API (`index.js`, with validation in `batch.js` and tests in `batch.test.js`) behind Caddy (HTTPS, Let's Encrypt, `92-5-185-123.sslip.io`). It adds counts to PostgreSQL table `hex_visits(cell, visits, first_seen, updated_at)`. Requests are validated (cell ID format, at most 500 cells and 100 per cell, 64 KB). Rate limiting is per IP, in memory only, and IPs are never logged or stored.
- **Setup:** upload `server/` and run `sudo bash server/deploy/setup.sh` on the Oracle Linux 9 server. It is idempotent: it installs PostgreSQL 16, Node 22 and Caddy 2.9.1 (checksum-verified), creates the DB, starts the services and opens 80/443 in firewalld. Ports 80 and 443 must also be allowed in the OCI subnet's security list.
- **Query the data:** `ssh … 'sudo -u plzenhex psql -d plzenhex -c "SELECT * FROM hex_visits ORDER BY visits DESC LIMIT 20"'`

## Hosting & dashboard

The server also hosts the web app: Caddy serves the Vite build from `/srv/plzen-hex`. Hashed assets are cached for a year, data for an hour, and HTML pages are always revalidated. To publish a new version:

```bash
SSH_KEY=~/Downloads/cau.key bash server/deploy/deploy-web.sh   # npm run build + upload + atomic swap
```

After changing anything in `server/`, upload it and re-run `sudo bash ~/server/deploy/setup.sh` on the server (it's idempotent).

**Dashboard** (`dashboard/index.html`, `src/dashboard/`): a second page of the same build. It reads `GET /api/visits` (aggregates, cached for 30 s on the server) every minute and shows:

- a heatmap of the grid on a single-hue blue scale with fixed, roughly logarithmic classes
- a hover (or tap) tooltip with the nearest place and the count
- summary numbers (total entries, visited hexagons and coverage, hexagons shown)
- a legend, the top 10 places and totals per district

Hexagons with fewer than 3 entries (`MIN_PUBLIC_VISITS` in the API's environment) are left out of the public per-cell data, so a single player's route can't be traced. They still count in the totals.

## Android test build (APK)

The web app is wrapped in a native Android shell with [Capacitor](https://capacitorjs.com/) 7 (`capacitor.config.ts`, the `android/` project). It's for testing only: a debug build, not signed for release.

```bash
npm run apk   # builds the web app, syncs it into android/, runs Gradle assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

This needs the Android SDK (`android/local.properties` → `sdk.dir`) and JDK 21 or newer (the script picks one with `java_home -v 21+`). Location permissions are declared in `android/app/src/main/AndroidManifest.xml`. The app data is bundled into the APK, but map tiles and map fonts are still loaded from the internet.

## Stack

- **Vite + TypeScript**, with no UI framework yet
- **MapLibre GL JS** using OpenStreetMap raster tiles. MapLibre renders with WebGL, so it can draw thousands of hexagons and points smoothly.

## Structure

```
public/data/plzensky-kraj.geojson   region boundary (OSM relation 442466, via Nominatim, ODbL)
public/data/pamatky.geojson         cultural monuments in the region (NPÚ, CC BY 4.0), see below
public/data/obce.geojson            centre points of all towns/villages (části obce) in the region (ČÚZK RÚIAN, CC BY 4.0)
public/data/osm-pois.geojson        lookout towers (49) and named peaks (1,214) (OpenStreetMap via Overpass, ODbL)
public/data/images.json             photos for 1,521 monuments: Commons file, author, licence, cs.wikipedia article
public/fonts/                       map label font (Open Sans Semibold: Latin, Czech, punctuation), bundled for offline use
scripts/fetch-monuments.mjs         regenerates pamatky.geojson from the NPÚ geoportal
scripts/fetch-places.mjs            regenerates obce.geojson from RÚIAN
scripts/fetch-osm-pois.mjs          regenerates osm-pois.geojson from Overpass
scripts/fetch-images.mjs            regenerates images.json from Wikidata + Wikimedia Commons
scripts/lib.mjs                     shared helpers (ArcGIS paging, point-in-polygon, municipality lookup)
src/config.ts                       map centre, bounds, zoom, data URLs
src/data/                           data loaders (one file per dataset)
src/map/createMap.ts                map setup, base style, controls (incl. GPS geolocate)
src/map/regionLayer.ts              region outline + dimmed area outside the region
src/map/hexLayer.ts                 hex grid layers (locked/unlocked via feature-state, current cell)
src/map/monumentsLayer.ts           clustered monument points (grey until discovered), labels, popup
src/map/poiLayer.ts                 lookout towers and peaks (grey until discovered), labels, popup
src/map/milestoneMarkers.ts         🏁 / 🏆 markers on milestone places
src/map/userMarker.ts               player position dot
src/hex/grid.ts                     H3 res-7 hexagons (≈5 km²), split into triangles where monuments are dense (~1.86k cells)
src/location/tracker.ts             geolocation watch + permission status
src/stats/progress.ts               generic progress tracker: each stat = items with H3 cells
src/stats/definitions.ts            which stats exist (okresy, města, obce, hrady, zámky, …)
src/state/unlocks.ts                unlocked cells + unlock time (localStorage for now → API later)
src/game/journal.ts                 chronological unlock log; replays stored unlocks through Progress
src/game/levels.ts                  XP rules, levels and level titles
src/game/milestones.ts              milestones (geographic extremes, highest peak, streaks, …)
src/game/challenges.ts              daily challenges (deterministic per day)
src/game/state.ts                   GameState: everything derived from the journal
src/geo.ts                          distance, direction arrow, centroid helpers
src/ui/homeScreen.ts                home screen: hiking scene, player card, challenges, milestones, badges, journal
src/ui/statsView.ts                 shared rendering (medal, achievement row, level/XP block, medal counts)
src/ui/statusPanel.ts               compact map panel: level, medals, daily progress, nearest goal, GPS status, toast
src/ui/celebrations.ts              pop-up cards for badges, milestones, level-ups and challenges
src/ui/sfx.ts                       synthesised sound effects (Web Audio)
src/main.ts                         entry point that wires everything together
```

Each new dataset or feature gets a loader in `src/data/` and a layer module in `src/map/` that `main.ts` calls.

## Hex grid

The base grid uses H3 resolution 7 (about 5 km² per hex). A hex with at least 8 monuments (`HEX_SUBDIVIDE_MIN_MONUMENTS`) splits into **6 triangles**, from the centre to each edge. A triangle that still has 8 or more splits into **4 smaller triangles** through its edge midpoints, down to `HEX_MAX_SUBDIVISION_DEPTH` (3 levels, smallest pieces about 0.2 km²). The pieces tile their parent exactly, so there are no gaps or overlaps. Cell IDs are `<h3>`, `<h3>-2` (triangle 2) and `<h3>-23` (its sub-triangle 3). `grid.cellAt` locates a point using the same geometry that is drawn. Unlock progress is saved separately for each grid configuration.

## Unlocking

The app opens on a home screen. **"Začít výlet"** switches to the map, asks for location permission (so the prompt follows a tap) and starts watching your position. The map centres on you at the first fix. "← Domů, odznaky a výzvy" in the map panel goes back, while GPS keeps running. The hexagon you're standing in unlocks when the GPS fix is accurate to within 150 m (`UNLOCK_MAX_ACCURACY_M` in `src/config.ts`). In dev mode, **Alt/Option + click** on the map simulates a GPS fix at that spot.

## Data: monuments (památky)

`public/data/pamatky.geojson` holds the protected cultural monuments in Plzeňský kraj from the NPÚ *Ústřední seznam kulturních památek*, about 1,700 points (26 of them NKP). It comes from the NPÚ ArcGIS layers `CP_PaKaOchreKP/0` (KP, main definition point) and `CP_UAP_BI/2` (NKP). The script keeps only currently protected items (`chraneno = 1`) inside the region boundary. It also drops places that aren't worth a visit for a tourist, such as ordinary houses, farmsteads, granaries, rectories, schools and wayside crosses (`NON_TOURISTIC` in the script). Exceptions (`TOURISTIC_ANYWAY`) keep museums, open-air folk architecture exhibits, Aleš sgraffiti, birthplaces and former churches or forts, and every NKP is always kept. Each monument is matched to its municipality using RÚIAN boundaries from ČÚZK. Generic or repeated names get the municipality appended, so "radnice" becomes "radnice, Plzeň". Each feature has the ÚSKP register number, name, object type, `nkp` flag and municipality. To refresh the data:

```bash
node scripts/fetch-monuments.mjs
```

## Data: lookout towers and peaks

`public/data/osm-pois.geojson` comes from OpenStreetMap via Overpass. It has every `tower:type=observation` (without military or private access, with point-and-outline duplicates merged) and every named `natural=peak` inside the region. Unnamed towers are named after their municipality ("rozhledna, Bor"). To refresh the data: `node scripts/fetch-osm-pois.mjs`.

## Data: monument photos

`public/data/images.json` matches monuments to Wikidata **exactly** by their ÚSKP register number (property P762) and takes the item's photo (P18). For each photo it stores the Commons author and licence, which the app shows as a credit line, plus the Czech Wikipedia article if there is one. 1,521 of the 1,710 monuments have a photo. Photos are only used if their licence is known. In the monument popup the photo is **blurred until the monument is discovered**. If it can't load (for example offline), it's left out. To refresh: `node scripts/fetch-images.mjs` (it paces its requests to stay within Commons' rate limit).

**To switch photos off:** set `SHOW_MONUMENT_PHOTOS = false` in `src/config.ts`. To remove the feature completely, delete `src/data/photos.ts`, `public/data/images.json`, `scripts/fetch-images.mjs` and the `.popup-photo` styles, and drop the `photos` argument in `main.ts` and `monumentsLayer.ts`.

## Offline

In the **Android app** everything except the map background works without a connection:

- **Bundled in the APK:** the app, all data and the map label font.
- **Works offline:** GPS unlocking, XP, badges, milestones, challenges and the journal; progress is stored on the device.
- **Visit counts** wait on the device and are sent when the connection returns.
- **Needs a connection:** OpenStreetMap tiles (the map background is blank for areas the WebView hasn't cached), monument photos and Wikipedia links. A fully offline map would need our own tile file (e.g. a PMTiles extract of the region).

The **website** needs a connection to open: there's no service worker.

## Gamification

Only the unlocked cells and the time of each unlock are stored (`UnlockStore`). Everything else is **derived** by replaying them in time order (`replayJournal` → `computeGameState`), so it can't drift out of sync and stays correct when the rules change:

- **XP and levels** (`src/game/levels.ts`): XP comes from new items (hexagon 10, district 100, town 50, městys 30, obec 20, village 5, monument 5, NKP +45, lookout tower 40, peak 15), from each achievement tier (bronze 50, silver 150, gold 400), and from milestones and daily challenges. Level *n* needs 50·n·(n−1) XP. Titles go from "Nováček" to "Legenda Plzeňska" (level 30).
- **Achievements:** every stat has bronze/silver/gold tiers (below), and each tier gives a title, e.g. "Hradní panoš → Hradní rytíř → Hradní pán".
- **Milestones** (`src/game/milestones.ts`, 23 in total):
  - **Places:** the northernmost, southernmost, westernmost and easternmost points of the region (the extreme vertices of the boundary), all four together, the centroid of the region, náměstí Republiky, the highest peak (Velká Mokrůvka, 1,370 m, taken from the data) and the Prazdroj brewery.
  - **Progress:** first hexagon, 10 and 100 hexagons, first NKP, and every part of one municipality.
  - **Daily feats:** 5 or 15 hexagons in one day, 3 castles in one day.
  - **Time:** early bird, night owl, a weekend trip, and 3-, 7- and 30-day streaks.
  
  Place milestones get 🏁 markers on the map and a "Ukázat na mapě" button.
- **Daily challenges** (`src/game/challenges.ts`): 3 a day (one hexagon challenge plus two from a pool of 12). They are seeded from the date, so everyone gets the same ones, and every past day is scored against its own challenges.
- **Streak:** consecutive days with an unlock.
- **Trip journal:** every unlock with its time, the nearest town or village, and what it discovered.
- **On the map:** undiscovered monuments, towers and peaks are grey. The panel shows the **nearest goal** (castle, chateau, monastery, NKP, lookout tower or milestone place), with distance and direction, and tapping it flies there.
- **Celebrations:** a level-up, new tier, milestone or completed challenge shows a pop-up card with confetti and a fanfare.
- **Reset:** "Smazat postup" at the bottom of the home screen (asks twice).

## Stats

Besides the hexagon count, the home screen's achievement sections track:

- **Places:** okresy (7), města (57), městyse (12), obce (432) and every village or town part (1,539). A municipality counts as visited when you unlock the hexagon containing its centre. That is the town part with the same name, or the historic core ("Vnitřní Město", "Klatovy I"). A district counts once you've visited any place in it.
- **Monuments:** all monuments, NKP, and one stat per category: castles, chateaux, monasteries, forts, churches, chapels, Jewish monuments, technical monuments, archaeological sites, and statues/crosses/memorials. A monument counts once its hexagon is unlocked. The category is set in `scripts/fetch-monuments.mjs` (`CATEGORIES`).
- **Nature:** lookout towers (49) and named peaks (1,214).

Every stat is an achievement with three tiers: **bronze at 10 %, silver at 50 % and gold at 100 %**. Thresholds round up and need at least 1 item, so the 7 districts need 1, 4 and 7 visits (`src/stats/tiers.ts`). The home screen shows the current medal and title for each stat, a progress bar with ticks at the bronze and silver thresholds, and how many more items the next tier needs. Reaching a new tier shows a medal pop-up.

Each stat is a list of items, each with one or more H3 cells (`src/stats/progress.ts`). Adding a new stat means adding one entry, with its three titles, in `src/stats/definitions.ts`, and optionally an XP value in `src/game/levels.ts`.

## Roadmap / design notes

- **Hex grid:** done with [H3](https://h3geo.org/). Cell IDs are stable strings, which makes them good keys for unlocks, stats and achievements. The grid is computed on the client (~0.2 s); it could be generated ahead of time if that ever becomes slow.
- **Monuments:** shown grey until discovered, with Commons photos (blurred until discovered). Next: a hex detail view listing everything inside a cell.
- **Users & unlocks:** a backend is needed (e.g. Supabase or Postgres + an API). Store `user_id, h3_cell, unlocked_at`. GPS unlocks must be validated on the server (accuracy and speed checks) to make spoofing harder.
- **Anonymised analytics:** aggregate visits per H3 cell and time bucket only, never raw GPS tracks. Hide cells below a k-anonymity threshold (e.g. fewer than 5 users). H3 cells are a natural unit for this.
- **OSM tiles:** `tile.openstreetmap.org` is fine for development and the hackathon demo. For production, switch to a tile provider, because the OSM tile usage policy forbids heavy use.
