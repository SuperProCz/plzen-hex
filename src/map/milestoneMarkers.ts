import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl";
import type { GameState } from "../game/state";
import { formatDate } from "../game/time";

const SOURCE = "milestones";
const LAYER = "milestone-marker";
/** Drawn beneath these, so monument clusters and points stay on top of the flags. */
const BELOW = "monument-clusters";
/** Layers whose own click handlers win when they overlap a flag. */
const ABOVE = ["monument-clusters", "monument-point", "poi-tower", "poi-peak"];
/** Emoji size in CSS px. */
const SIZE = 22;

/** 🏁 markers on milestone places (🏆 once achieved), as a map layer. Returns an updater. */
export function addMilestoneMarkers(map: Map, state: GameState): (state: GameState) => void {
  addEmojiImage(map, "milestone-open", "🏁");
  addEmojiImage(map, "milestone-done", "🏆");
  map.addSource(SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer(
    {
      id: LAYER,
      type: "symbol",
      source: SOURCE,
      layout: {
        "icon-image": ["case", ["get", "done"], "milestone-done", "milestone-open"],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    map.getLayer(BELOW) ? BELOW : undefined,
  );

  let current = state;
  map.on("click", LAYER, (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const above = ABOVE.filter((id) => map.getLayer(id));
    if (map.queryRenderedFeatures(e.point, { layers: above }).length) return;
    const entry = current.milestones.find((m) => m.milestone.id === feature.properties.id);
    if (!entry) return;
    const { milestone, status } = entry;

    const content = document.createElement("div");
    content.className = "monument-popup";
    const title = document.createElement("strong");
    title.textContent = `${milestone.icon} ${milestone.title}`;
    content.append(
      title,
      Object.assign(document.createElement("div"), { textContent: milestone.description }),
      Object.assign(document.createElement("div"), {
        className: status.done ? "popup-state is-found" : "popup-state",
        textContent: status.done
          ? `✓ Splněno${status.time ? ` ${formatDate(status.time)}` : ""}`
          : `Milník · +${milestone.xp} XP`,
      }),
    );
    new maplibregl.Popup({ offset: 18, maxWidth: "240px" }).setLngLat(milestone.target!).setDOMContent(content).addTo(map);
  });
  map.on("mouseenter", LAYER, () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", LAYER, () => (map.getCanvas().style.cursor = ""));

  const update = (s: GameState) => {
    current = s;
    map.getSource<GeoJSONSource>(SOURCE)!.setData({
      type: "FeatureCollection",
      features: s.milestones
        .filter(({ milestone }) => milestone.target)
        .map(({ milestone, status }) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: milestone.target! },
          properties: { id: milestone.id, done: status.done },
        })),
    });
  };
  update(state);
  return update;
}

/** Renders an emoji with a soft drop shadow into a map image (2× for sharp edges). */
function addEmojiImage(map: Map, name: string, emoji: string): void {
  const ratio = 2;
  const px = Math.ceil(SIZE * 1.4) * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${SIZE * ratio}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 2 * ratio;
  ctx.shadowOffsetY = 1 * ratio;
  ctx.fillText(emoji, px / 2, px / 2);
  map.addImage(name, ctx.getImageData(0, 0, px, px), { pixelRatio: ratio });
}
