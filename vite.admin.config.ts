import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The admin is a separate Vite app from the public site: it is served on
// portfolio-admin.harmadavtian.com by the API, so Syncfusion never ships to
// public visitors and admin code never reaches the GoDaddy build.
//
// In development it proxies /api to the local API, which keeps the session
// cookie same-origin - the same arrangement as production, where one Express
// app serves both the admin and the API on that hostname.
export default defineConfig({
  root: "admin",
  // Separate dependency cache from the site's dev server. Sharing
  // node_modules/.vite let one server's re-optimisation invalidate the other's
  // pre-bundled deps, which broke /cinematic with 504 "Outdated Optimize Dep".
  cacheDir: "../node_modules/.vite-admin",
  // envDir defaults to `root`, which would look for admin/.env and miss the
  // repo-root .env that holds VITE_SYNCFUSION_LICENSE_KEY (licence banner).
  envDir: "..",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "../dist-admin",
    emptyOutDir: true,
  },
});
