import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev:phone` serves over HTTPS on the LAN — browsers only allow geolocation on secure origins.
export default defineConfig(({ mode }) => ({
  plugins: mode === "phone" ? [basicSsl()] : [],
  build: {
    rollupOptions: {
      // Two pages: the game and the public visit-statistics dashboard.
      input: { main: "index.html", dashboard: "dashboard/index.html" },
    },
  },
}));
