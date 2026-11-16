import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";
import { PooledTransactionClient, readRuntimeConfig } from "../apps/api-server/src/main.js";

test("production runtime config fails closed without TLS and database settings",()=>{
  assert.throws(()=>readRuntimeConfig({} as NodeJS.ProcessEnv),/TPAY_ENV_REQUIRED/);
  const config=readRuntimeConfig({
    TPAY_DATABASE_URL:"postgresql://db",
    TPAY_TLS_KEY_FILE:"/tmp/key.pem",
    TPAY_TLS_CERT_FILE:"/tmp/cert.pem",
    TPAY_API_HOST:"127.0.0.1",
    TPAY_API_PORT:"9443",
    TPAY_WEB_ORIGINS:"https://app.example.test"
  } as NodeJS.ProcessEnv);
  assert.equal(config.port,9443);
  assert.equal(config.host,"127.0.0.1");
  assert.deepEqual(config.webOrigins,["https://app.example.test"]);
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


test("pooled transaction client releases its connection after COMMIT and ROLLBACK",async()=>{
  for(const command of ["COMMIT","ROLLBACK","COMMIT;","ROLLBACK;"]){
    let released=0;
    const client={query:async()=>({rows:[],rowCount:0}),release:()=>{released++;}};
    const pool={connect:async()=>client} as any;
    const transaction=new PooledTransactionClient(pool);
    await transaction.query(`  ${command}  `);
    assert.equal(released,1,`${command} must release the checked-out connection`);
    transaction.release();
    assert.equal(released,1,"release after transaction completion must be a no-op");
  }
});

test("pooled transaction client keeps the connection checked out for ordinary statements",async()=>{
  let released=0;
  const client={query:async()=>({rows:[],rowCount:1}),release:()=>{released++;}};
  const transaction=new PooledTransactionClient({connect:async()=>client} as any);
  await transaction.query("SELECT 1");
  assert.equal(released,0);
  transaction.release();
  assert.equal(released,1);
});
