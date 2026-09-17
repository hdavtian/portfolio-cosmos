import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { profileHeadPlugin } from "./scripts/vite-profile-head";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Production builds write the published name/title into index.html.
    profileHeadPlugin(loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE_URL ?? process.env.VITE_API_BASE_URL),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
        },
      },
    },
  },
}));
