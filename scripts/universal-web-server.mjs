import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {join,normalize,extname} from "node:path";
import {fileURLToPath} from "node:url";

const root=join(fileURLToPath(new URL("../apps/universal/dist/",import.meta.url)));
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".png":"image/png"};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent((req.url??"/").split("?")[0]);
  const candidate=normalize(join(root,pathname==="/"?"index.html":pathname.replace(/^\/+/, "")));
  if(!candidate.startsWith(root))throw new Error("PATH_TRAVERSAL");
  const body=await readFile(candidate);
  res.writeHead(200,{"content-type":mime[extname(candidate)]??"application/octet-stream","cache-control":"no-store","x-content-type-options":"nosniff"});
  res.end(body);
 }catch{
  try{const body=await readFile(join(root,"index.html"));res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"});res.end(body);}
  catch{res.writeHead(500);res.end("Universal build unavailable");}
 }
});
const port=Number(process.env.PORT??4174);
server.listen(port,"127.0.0.1",()=>console.log("Universal E2E server "+port));
