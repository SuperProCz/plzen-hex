import type { LngLatBoundsLike, LngLatLike } from "maplibre-gl";

/** Plzeň city centre (náměstí Republiky). */
export const PLZEN_CENTER: LngLatLike = [13.3776, 49.7475];

/** Bounding box of Plzeňský kraj (OSM relation 442466), padded slightly. */
export const REGION_BOUNDS: LngLatBoundsLike = [
  [12.3, 48.85],
  [13.95, 50.2],
];

export const INITIAL_ZOOM = 8.50;

export const REGION_BOUNDARY_URL = "/data/plzensky-kraj.geojson";

/** Base H3 resolution: 7 ≈ 5 km² per hexagon (~1,700 cells for the region). */
export const HEX_RESOLUTION = 7;

/**
 * A hexagon with at least this many monuments splits into 6 triangles (centre → each edge), and a
 * triangle with that many splits again into 4 (via edge midpoints), up to HEX_MAX_SUBDIVISION_DEPTH levels.
 * Keeps dense historic towns from being one big hex, and the pieces tile their parent exactly.
 */
export const HEX_SUBDIVIDE_MIN_MONUMENTS = 8;
export const HEX_MAX_SUBDIVISION_DEPTH = 3;

/** A GPS fix must be at least this accurate (metres) to unlock a hexagon. Hex edge ≈ 1.4 km. */
export const UNLOCK_MAX_ACCURACY_M = 150;

export const MONUMENTS_URL = "/data/pamatky.geojson";

export const PLACES_URL = "/data/obce.geojson";

export const POIS_URL = "/data/osm-pois.geojson";

/**
 * Where anonymous hexagon entry counts are sent (see server/). Off in `npm run dev` unless
 * VITE_ANALYTICS_URL is set, so simulated Alt+click visits never reach the real statistics.
 */
/** Public read of the aggregated counts (dashboard). Reading is harmless, so dev reads production too. */
export const VISITS_READ_URL: string =
  import.meta.env.VITE_ANALYTICS_URL ?? "https://92-5-185-123.sslip.io/api/visits";

export const ANALYTICS_URL: string | null =
  import.meta.env.VITE_ANALYTICS_URL ?? (import.meta.env.DEV ? null : "https://92-5-185-123.sslip.io/api/visits");

/**
 * Monument photos from Wikimedia Commons (public/data/images.json, built by scripts/fetch-images.mjs).
 * Set to false to switch the feature off entirely; nothing else depends on it.
 */
export const SHOW_MONUMENT_PHOTOS = true;
export const MONUMENT_PHOTOS_URL = "/data/images.json";
