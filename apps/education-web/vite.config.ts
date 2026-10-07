import {defineConfig} from "vite";
import {readFileSync} from "node:fs";

const tlsKeyFile=process.env.TPAY_WEB_TLS_KEY_FILE?.trim();
const tlsCertFile=process.env.TPAY_WEB_TLS_CERT_FILE?.trim();

const https=tlsKeyFile&&tlsCertFile
  ? {key:readFileSync(tlsKeyFile),cert:readFileSync(tlsCertFile)}
  : undefined;

export default defineConfig({
  root:"apps/education-web",
  build:{outDir:"../../dist/education-web",emptyOutDir:true},
  server:{
    host:"0.0.0.0",
    port:5173,
    strictPort:true,
    ...(https?{https}: {})
  }
});
