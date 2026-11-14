import { distanceM } from "../geo";
import type { Places } from "./places";

export interface NamedPlace {
  /** "Šťáhlavice (Šťáhlavy)", or just "Plzeň" when the part has the municipality's name. */
  name: string;
  district: string;
}

/** Names a point after the nearest town/village centre. */
export function makePlaceNamer(places: Places): (coords: number[]) => NamedPlace {
  return (coords) => {
    let best = Infinity;
    let found: NamedPlace = { name: "Plzeňský kraj", district: "" };
    for (const f of places.features) {
      const d = distanceM(coords, f.geometry.coordinates);
      if (d < best) {
        best = d;
        const p = f.properties;
        found = { name: p.name === p.municipality ? p.name : `${p.name} (${p.municipality})`, district: p.district };
      }
    }
    return found;
  };
}
