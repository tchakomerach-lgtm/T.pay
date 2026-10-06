import {runHealthProbes} from "../dist/packages/api-gateway/src/health.js";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join,normalize} from "node:path";
import {fileURLToPath} from "node:url";

const root=join(fileURLToPath(new URL("../",import.meta.url)),"dist");
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".ico":"image/x-icon"};
const port=Number(process.env.PORT??4173);
const server=createServer(async(req,res)=>{
  if ((req.url??"").split("?")[0] === "/v1/health") {
    const report=await runHealthProbes([
      {name:"web-server",check:async()=>true},
      {name:"tpay-core",check:async()=>true}
    ]);
    res.writeHead(report.ready?200:503,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*"});
    res.end(JSON.stringify({service:"tpay-web-alpha",mode:"sandbox",...report}));
    return;
  }
  try{
    const requestPath=decodeURIComponent((req.url??"/").split("?")[0]);
    const relative=requestPath==="/"?"apps/web/index.html":requestPath.replace(/^\/+/,"");
    const file=normalize(join(root,relative));
    if(!file.startsWith(root))throw new Error("PATH_TRAVERSAL");
    const body=await readFile(file);
    res.writeHead(200,{"content-type":mime[extname(file)]??"application/octet-stream","cache-control":"no-store"});
    res.end(body);
  }catch{
    try{
      const body=await readFile(join(root,"apps/web/index.html"));
      res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
      res.end(body);
    }catch{res.writeHead(500);res.end("T.Pay Web Alpha indisponible");}
  }
});
server.listen(port,"0.0.0.0",()=>console.log(`T.Pay Web Alpha: http://localhost:${port}`));
