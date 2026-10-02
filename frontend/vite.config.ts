import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Served from the root of its own subdomain (README → Deploying). Absolute
  // asset paths keep working on nested URLs, which the server answers with
  // index.html.
  base: "/",
  plugins: [react()],
  // In development the backend runs on its own port (backend/README.md); the site asks for
  // /api on its own origin, as in production.
  server: {
    proxy: { "/api": "http://localhost:8000" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
