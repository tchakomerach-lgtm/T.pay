import {defineConfig} from "vite";
export default defineConfig({
  root:"apps/education-web",
  build:{outDir:"../../dist/education-web",emptyOutDir:true},
  server:{https:true,host:"0.0.0.0",port:5173,strictPort:true}
});
