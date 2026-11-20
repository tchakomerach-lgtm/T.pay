import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";
import { readRuntimeConfig } from "../apps/api-server/src/main.js";

test("production runtime config fails closed without TLS and database settings",()=>{
  assert.throws(()=>readRuntimeConfig({} as NodeJS.ProcessEnv),/TPAY_ENV_REQUIRED/);
  const config=readRuntimeConfig({
    TPAY_DATABASE_URL:"postgresql://db",
    TPAY_TLS_KEY_FILE:"/tmp/key.pem",
    TPAY_TLS_CERT_FILE:"/tmp/cert.pem",
    TPAY_API_HOST:"127.0.0.1",
    TPAY_API_PORT:"9443",
    TPAY_WEB_ORIGINS:"https://127.0.0.1:5173"
  } as NodeJS.ProcessEnv);
  assert.equal(config.port,9443);
  assert.equal(config.host,"127.0.0.1");
  assert.deepEqual(config.webOrigins,["https://127.0.0.1:5173"]);
});

test("school API exposes liveness and database readiness without authentication",async()=>{
  const server=createSchoolApiServer({
    db:{query:async()=>({rows:[],rowCount:1})} as any,
    authenticate:async()=>{throw new Error("AUTH_MUST_NOT_RUN")},
    syncClient:()=>({query:async()=>({rows:[],rowCount:0})}),
    corsOrigins:["http://127.0.0.1:5173"]
  });
  await new Promise<void>(resolve=>server.listen(0,resolve));
  const port=(server.address() as {port:number}).port;
  try{
    const live=await fetch(`http://127.0.0.1:${port}/health/live`);
    assert.equal(live.status,200);
    assert.deepEqual(await live.json(),{ok:true,status:"live"});
    const preflight=await fetch(`http://127.0.0.1:${port}/v1/education/actors/a`,{method:"OPTIONS",headers:{Origin:"http://127.0.0.1:5173","Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"authorization"}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get("access-control-allow-origin"),"http://127.0.0.1:5173");
    const ready=await fetch(`http://127.0.0.1:${port}/health/ready`);
    assert.equal(ready.status,200);
    assert.deepEqual(await ready.json(),{ok:true,status:"ready"});
  }finally{
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

import { PooledTransactionClient } from "../apps/api-server/src/main.js";

test("pooled transaction client releases its connection after COMMIT and ROLLBACK",async()=>{
  let released=0;
  const statements:string[]=[];
  const client={
    query:async(sql:string)=>{statements.push(sql);return {rows:[],rowCount:0};},
    release:()=>{released++;}
  };
  const pool={connect:async()=>client} as any;
  const tx=new PooledTransactionClient(pool);
  await tx.query("BEGIN");
  assert.equal(released,0);
  await tx.query("COMMIT");
  assert.equal(released,1);
  await tx.query("BEGIN");
  await tx.query("ROLLBACK");
  assert.equal(released,2);
  assert.deepEqual(statements,["BEGIN","COMMIT","BEGIN","ROLLBACK"]);
});

test("pooled transaction client releases a broken connection after query failure",async()=>{
  let released=0;
  const client={
    query:async()=>{throw new Error("DB_QUERY_FAILED");},
    release:()=>{released++;}
  };
  const tx=new PooledTransactionClient({connect:async()=>client} as any);
  await assert.rejects(()=>tx.query("SELECT 1"),/DB_QUERY_FAILED/);
  assert.equal(released,1);
});
