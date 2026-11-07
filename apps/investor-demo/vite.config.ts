import {defineConfig} from "vite";

export default defineConfig({
  root: "apps/investor-demo",
  base: "./",
  build: {
    outDir: "../../dist/investor-demo",
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    host: "0.0.0.0",
    port: 4174,
    strictPort: true
  },
  preview: {
    host: "0.0.0.0",
    port: 4175,
    strictPort: true
  }
});