import maplibregl, { type Map } from "maplibre-gl";

export interface UserMarker {
  move(lng: number, lat: number): void;
  /** Expanding ring around the dot, e.g. when a hexagon unlocks. */
  pulse(): void;
}

export function createUserMarker(map: Map): UserMarker {
  const el = document.createElement("div");
  el.className = "user-dot";
  let marker: maplibregl.Marker | null = null;

  return {
    move(lng, lat) {
      if (!marker) marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      else marker.setLngLat([lng, lat]);
    },
    pulse() {
      el.classList.remove("pulse");
      void el.offsetWidth; // restart the animation
      el.classList.add("pulse");
    },
  };
}
