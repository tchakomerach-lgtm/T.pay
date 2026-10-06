import {runHealthProbes} from "../dist/packages/api-gateway/src/health.js";
import {createServer} from "node:http";
import {createServer as createHttpsServer} from "node:https";
import {readFileSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {extname,join,normalize} from "node:path";
import {fileURLToPath} from "node:url";

const root=join(fileURLToPath(new URL("../",import.meta.url)),"dist");
const mime={" .html":"text/html; charset=utf-8",".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon"};

function securityHeaders(secure){
  const headers={
    "content-security-policy":"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
    "x-content-type-options":"nosniff",
    "referrer-policy":"strict-origin-when-cross-origin",
    "permissions-policy":"camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy":"same-origin",
    "cross-origin-resource-policy":"same-origin",
    "cache-control":"no-store",
    "x-frame-options":"DENY"
  };
  if(secure) headers["strict-transport-security"]="max-age=63072000; includeSubDomains";
  return headers;
}

export function createWebServer({port=Number(process.env.PORT??4173), tlsKey=process.env.TPAY_TLS_KEY_FILE, tlsCert=process.env.TPAY_TLS_CERT_FILE, production=process.env.NODE_ENV==="production"}={}){
  if(production && (!tlsKey || !tlsCert)) throw new Error("TLS_CERTIFICATE_REQUIRED_IN_PRODUCTION");
  const secure=Boolean(tlsKey && tlsCert);
  const handler=async(req,res)=>{
    const headers=securityHeaders(secure);
    if((req.url??"").split("?")[0]==="/v1/health"){
      const report=await runHealthProbes([
        {name:"web-server",check:async()=>true},
        {name:"tpay-core",check:async()=>true}
      ]);
      res.writeHead(report.ready?200:503,{...headers,"content-type":"application/json; charset=utf-8"});
      res.end(JSON.stringify({service:"tpay-web-alpha",mode:"sandbox",transport:secure?"https":"http",...report}));
      return;
    }
    try{
      const requestPath=decodeURIComponent((req.url??"/").split("?")[0]);
      const relative=requestPath==="/"?"apps/web/index.html":requestPath.replace(/^\/+/, "");
      const file=normalize(join(root,relative));
      if(!file.startsWith(root)) throw new Error("PATH_TRAVERSAL");
      const body=await readFile(file);
      res.writeHead(200,{...headers,"content-type":mime[extname(file)]??"application/octet-stream"});
      res.end(body);
    }catch{
      try{
        const body=await readFile(join(root,"apps/web/index.html"));
        res.writeHead(200,{...headers,"content-type":"text/html; charset=utf-8"});
        res.end(body);
      }catch{res.writeHead(500,{...headers,"content-type":"text/plain; charset=utf-8"});res.end("T.Pay Web Alpha indisponible");}
    }
  };
  const server=secure
    ? createHttpsServer({key:readFileSync(tlsKey),cert:readFileSync(tlsCert),minVersion:"TLSv1.3"},handler)
    : createServer(handler);
  return {server,port,secure};
}

if(process.env.TPAY_WEB_SERVER_TEST!=="1"){
  const {server,port,secure}=createWebServer();
  server.listen(port,"0.0.0.0",()=>console.log(`T.Pay Web Alpha: ${secure?"https":"http"}://localhost:${port}`));
}
