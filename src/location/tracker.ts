export interface Fix {
  lng: number;
  lat: number;
  /** Accuracy radius in metres. */
  accuracy: number;
  timestamp: number;
}

export type LocationStatus = "requesting" | "tracking" | "denied" | "unavailable" | "unsupported";

/** Starts watching the device position (this triggers the browser permission prompt). Returns a stop function. */
export function startTracking(
  onFix: (fix: Fix) => void,
  onStatus: (status: LocationStatus) => void,
): () => void {
  if (!("geolocation" in navigator)) {
    onStatus("unsupported");
    return () => {};
  }

  onStatus("requesting");
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onStatus("tracking");
      onFix({
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
    },
    (err) => onStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
  );

  return () => navigator.geolocation.clearWatch(id);
}
