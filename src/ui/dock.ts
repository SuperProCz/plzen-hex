let dock: HTMLElement | null = null;

/**
 * Shared bottom area for transient notifications: badge/milestone cards stack above the unlock toast
 * in one flex column, so they can never overlap however tall either gets.
 */
export function notificationDock(): HTMLElement {
  if (!dock) {
    dock = document.createElement("div");
    dock.className = "notification-dock";
    document.body.append(dock);
  }
  return dock;
}
