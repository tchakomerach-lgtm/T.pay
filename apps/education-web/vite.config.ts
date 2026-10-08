import {defineConfig} from "vite";
import {readFileSync} from "node:fs";

export default defineConfig(({command})=>{
  const tlsKeyFile=process.env.TPAY_WEB_TLS_KEY_FILE?.trim();
  const tlsCertFile=process.env.TPAY_WEB_TLS_CERT_FILE?.trim();
  if(command==="serve" && (!tlsKeyFile || !tlsCertFile)){
    throw new Error("TPAY_WEB_HTTPS_CERTIFICATES_REQUIRED");
  }
  const https=tlsKeyFile&&tlsCertFile
    ? {key:readFileSync(tlsKeyFile),cert:readFileSync(tlsCertFile)}
    : undefined;
  return {
    root:"apps/education-web",
    build:{outDir:"../../dist/education-web",emptyOutDir:true},
    server:{
      host:"0.0.0.0",
      port:5173,
      strictPort:true,
      ...(https?{https}: {})
    }
  };
});
