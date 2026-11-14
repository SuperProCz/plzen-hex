import maplibregl, { type Map } from "maplibre-gl";
import type { GameState } from "../game/state";
import { formatDate } from "../game/time";

/** 🏁 markers on milestone places (🏆 once achieved). Returns an updater. */
export function addMilestoneMarkers(map: Map, state: GameState): (state: GameState) => void {
  const markers = new globalThis.Map<string, { el: HTMLElement; content: HTMLElement }>();
  for (const { milestone } of state.milestones) {
    if (!milestone.target) continue;
    const el = document.createElement("div");
    el.className = "milestone-marker";
    el.title = milestone.title;
    const content = document.createElement("div");
    content.className = "monument-popup";
    const popup = new maplibregl.Popup({ offset: 18, maxWidth: "240px" }).setDOMContent(content);
    new maplibregl.Marker({ element: el }).setLngLat(milestone.target).setPopup(popup).addTo(map);
    markers.set(milestone.id, { el, content });
  }

  const update = (s: GameState) => {
    for (const { milestone, status } of s.milestones) {
      const marker = markers.get(milestone.id);
      if (!marker) continue;
      marker.el.textContent = status.done ? "🏆" : "🏁";
      marker.el.classList.toggle("is-done", status.done);

      const title = document.createElement("strong");
      title.textContent = `${milestone.icon} ${milestone.title}`;
      const state = Object.assign(document.createElement("div"), {
        className: status.done ? "popup-state is-found" : "popup-state",
        textContent: status.done
          ? `✓ Splněno${status.time ? ` ${formatDate(status.time)}` : ""}`
          : `Milník · +${milestone.xp} XP`,
      });
      marker.content.replaceChildren(
        title,
        Object.assign(document.createElement("div"), { textContent: milestone.description }),
        state,
      );
    }
  };
  update(state);
  return update;
}
