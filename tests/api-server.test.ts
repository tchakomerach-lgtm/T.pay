import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:https";

test("secure API adapter serves health only over TLS 1.3",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"tpay-api-"));
  try{
    execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-keyout",join(dir,"key.pem"),"-out",join(dir,"cert.pem"),"-days","1","-subj","/CN=localhost"],{stdio:"ignore"});
    const {createApiServer}=await import(new URL("../apps/api/src/server.js",import.meta.url).href);
    const {server}=createApiServer({tlsKey:join(dir,"key.pem"),tlsCert:join(dir,"cert.pem")});
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",()=>resolve()));
    const address=server.address(); assert.ok(address&&typeof address==="object");
    const result=await new Promise<{status:number;headers:Record<string,string|undefined>;body:string}>((resolve,reject)=>{
      const req=request({hostname:"127.0.0.1",port:address.port,path:"/v1/health",rejectUnauthorized:false,minVersion:"TLSv1.3"},res=>{let body="";res.on("data",c=>body+=c);res.on("end",()=>resolve({status:res.statusCode??0,headers:res.headers as Record<string,string|undefined>,body}));});
      req.on("error",reject);req.end();
    });
    assert.equal(result.status,200);
    assert.equal(result.headers["strict-transport-security"],"max-age=63072000; includeSubDomains");
    assert.match(result.body,/api-server/);
    server.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
