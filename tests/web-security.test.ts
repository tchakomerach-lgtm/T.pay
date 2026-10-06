import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {request} from "node:https";

function createCertificate(dir:string){
  execFileSync("openssl",[
    "req","-x509","-newkey","rsa:2048","-nodes",
    "-keyout",join(dir,"key.pem"),"-out",join(dir,"cert.pem"),
    "-days","1","-subj","/CN=localhost"
  ],{stdio:"ignore"});
}

test("web server contains mandatory transport security controls",async()=>{
 const source=readFileSync("scripts/web-server.mjs","utf8");
 assert.match(source,/TLSv1\.3/);
 assert.match(source,/strict-transport-security/);
 assert.match(source,/content-security-policy/);
 assert.match(source,/x-content-type-options/);
 assert.match(source,/x-frame-options/);
 assert.match(source,/TLS_CERTIFICATE_REQUIRED_IN_PRODUCTION/);
});

test("production cannot start without certificate material",async()=>{
 const source=readFileSync("scripts/web-server.mjs","utf8");
 assert.match(source,/production && \(!tlsKey \|\| !tlsCert\)/);
});

test("HTTPS runtime negotiates TLS 1.3 and emits security headers",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"tpay-tls-"));
 try{
   createCertificate(dir);
   process.env.TPAY_WEB_SERVER_TEST="1";
   const serverModuleUrl=new URL("../../scripts/web-server.mjs",import.meta.url).href;
   const {createWebServer}=await import(serverModuleUrl);
   const {server}=createWebServer({port:0,tlsKey:join(dir,"key.pem"),tlsCert:join(dir,"cert.pem"),production:true});
   await new Promise<void>((resolve)=>server.listen(0,"127.0.0.1",()=>resolve()));
   const address=server.address();
   assert.ok(address && typeof address==="object");
   const result=await new Promise<{status:number;headers:Record<string,string|undefined>}>((resolve,reject)=>{
     const req=request({hostname:"127.0.0.1",port:address.port,path:"/v1/health",rejectUnauthorized:false,minVersion:"TLSv1.3"},res=>{
       res.resume();
       res.on("end",()=>resolve({status:res.statusCode??0,headers:res.headers as Record<string,string|undefined>}));
     });
     req.on("error",reject);
     req.end();
   });
   assert.equal(result.status,200);
   assert.equal(result.headers["strict-transport-security"],"max-age=63072000; includeSubDomains");
   assert.equal(result.headers["content-security-policy"]?.includes("default-src 'self'"),true);
   assert.equal(result.headers["x-content-type-options"],"nosniff");
   server.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
