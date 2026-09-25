import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Served from the root of its own subdomain (README → Deploying). Absolute
  // asset paths keep working on nested URLs, which the server answers with
  // index.html.
  base: "/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
