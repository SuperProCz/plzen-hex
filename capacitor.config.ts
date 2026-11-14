import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the built web app (dist/) into an Android app for testing on a phone. See README → Android test build.
const config: CapacitorConfig = {
  appId: "cz.plzenhex.app",
  appName: "Plzeň Hex",
  webDir: "dist",
};

export default config;
