import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/brain-agent/",
  publicDir: "public",
  resolve: {
    alias: {
      "@brain/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
      },
    },
  },
});
