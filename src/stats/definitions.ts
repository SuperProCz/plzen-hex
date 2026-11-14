import type { MonumentCategory, Monuments } from "../data/monuments";
import type { MunicipalityType, Places } from "../data/places";
import { poiLabel, type PoiKind, type Pois } from "../data/pois";
import type { HexGrid } from "../hex/grid";
import type { StatDef, StatItem } from "./progress";

type Titles = [string, string, string];

const MUNICIPALITY_STATS: [MunicipalityType, string, Titles][] = [
  ["mesto", "Města", ["Městský chodec", "Městský cestovatel", "Pán měst"]],
  ["mestys", "Městyse", ["Host městysů", "Znalec městysů", "Pán městysů"]],
  ["obec", "Obce", ["Venkovan", "Obecní poutník", "Znalec všech obcí"]],
];

const MONUMENT_STATS: [MonumentCategory, string, Titles][] = [
  ["hrad", "Hrady a zříceniny", ["Hradní panoš", "Hradní rytíř", "Hradní pán"]],
  ["zamek", "Zámky", ["Zámecký host", "Zámecký správce", "Zámecký pán"]],
  ["klaster", "Kláštery", ["Poutník", "Novic", "Opat"]],
  ["tvrz", "Tvrze", ["Zvěd", "Vladyka", "Pán tvrzí"]],
  ["kostel", "Kostely", ["Farník", "Kostelník", "Biskup"]],
  ["kaple", "Kaple", ["Ministrant", "Kaplan", "Děkan"]],
  ["zidovske", "Židovské památky", ["Návštěvník", "Znalec", "Strážce paměti"]],
  ["technicke", "Technické památky", ["Kutil", "Technik", "Inženýr"]],
  ["archeologie", "Archeologické lokality", ["Kopáč", "Archeolog", "Profesor archeologie"]],
  ["sochy", "Sochy, kříže a pomníky", ["Obdivovatel", "Sběratel soch", "Mistr sochař"]],
];

const POI_STATS: [PoiKind, string, Titles][] = [
  ["rozhledna", "Rozhledny", ["Vyhlížeč", "Rozhledník", "Pán rozhleden"]],
  ["vrchol", "Vrcholy", ["Kopcař", "Horal", "Vrcholový mistr"]],
];

export function buildStats(grid: HexGrid, monuments: Monuments, places: Places, pois: Pois): StatDef[] {
  const cellsAt = ([lng, lat]: number[]) => {
    const cell = grid.cellAt(lng, lat);
    return cell ? [cell] : [];
  };
  const pointItem = (name: string, coords: number[]): StatItem => ({ name, cells: cellsAt(coords) });

  const stats: StatDef[] = [
    {
      id: "hexes",
      label: "Hexagony",
      group: "explore",
      titles: ["Průzkumník", "Kartograf", "Pán mapy"],
      items: [...grid.cells].map((cell) => ({ name: cell, cells: [cell] })),
    },
  ];

  const districts = new Map<string, string[]>();
  for (const f of places.features) {
    const cells = districts.get(f.properties.district) ?? [];
    cells.push(...cellsAt(f.geometry.coordinates));
    districts.set(f.properties.district, cells);
  }
  stats.push({
    id: "districts",
    label: "Okresy",
    group: "places",
    titles: ["Okresní turista", "Krajský cestovatel", "Znalec všech okresů"],
    items: [...districts].map(([name, cells]) => ({ name: `okres ${name}`, cells })),
  });

  const centres = places.features.filter((f) => f.properties.main);
  for (const [type, label, titles] of MUNICIPALITY_STATS) {
    stats.push({
      id: `municipality-${type}`,
      label,
      group: "places",
      titles,
      items: centres
        .filter((f) => f.properties.type === type)
        .map((f) => pointItem(f.properties.municipality, f.geometry.coordinates)),
    });
  }
  stats.push({
    id: "villages",
    label: "Vesnice a místní části",
    group: "places",
    titles: ["Vesnický tulák", "Pocestný", "Znalec každé vísky"],
    items: places.features.map((f) => pointItem(f.properties.name, f.geometry.coordinates)),
  });

  const monumentItems = (filter: (f: Monuments["features"][number]) => boolean) =>
    monuments.features.filter(filter).map((f) => pointItem(f.properties.name, f.geometry.coordinates));
  stats.push(
    {
      id: "monuments",
      label: "Všechny památky",
      group: "monuments",
      titles: ["Sběratel památek", "Památkář", "Strážce dědictví"],
      items: monumentItems(() => true),
    },
    {
      id: "nkp",
      label: "Národní kulturní památky",
      group: "monuments",
      titles: ["Ctitel národních památek", "Národní znalec", "Národní poklad"],
      items: monumentItems((f) => f.properties.nkp),
    },
  );
  for (const [category, label, titles] of MONUMENT_STATS) {
    stats.push({
      id: `monuments-${category}`,
      label,
      group: "monuments",
      titles,
      items: monumentItems((f) => f.properties.category === category),
    });
  }

  for (const [kind, label, titles] of POI_STATS) {
    stats.push({
      id: `pois-${kind}`,
      label,
      group: "nature",
      titles,
      items: pois.features
        .filter((f) => f.properties.kind === kind)
        .map((f) => pointItem(poiLabel(f.properties), f.geometry.coordinates)),
    });
  }

  return stats;
}
