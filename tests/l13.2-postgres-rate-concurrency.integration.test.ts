import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {ApiAbuseRepository} from "../packages/api-gateway/src/rate-abuse.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("L13.2 PostgreSQL serializes competing rate-limit increments without lost updates",{skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"},async()=>{
  const setup=new pg.Client({connectionString:databaseUrl});
  const workers=await Promise.all(Array.from({length:8},()=>new pg.Client({connectionString:databaseUrl})));
  const policyKey="test-concurrency:"+randomUUID();
  const scopeSecret="device:"+randomUUID();
  const now="2026-10-05T10:01:12.000Z";
  try{
    await setup.connect();
    await Promise.all(workers.map(c=>c.connect()));
    await applyMigrations(setup,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    const repositories=workers.map(c=>new ApiAbuseRepository(c));
    const decisions=await Promise.all(repositories.map(repo=>repo.consume({
      policyKey,scopeSecret,now,maxRequests:3,windowSeconds:60
    })));
    assert.equal(decisions.length,8);
    assert.deepEqual(decisions.map(d=>Number(d.requestCount)).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
    assert.equal(decisions.filter(d=>d.allowed).length,3);
    assert.equal(decisions.filter(d=>d.limited).length,5);
    const persisted=await setup.query(
      "SELECT request_count,max_requests,window_seconds FROM api_rate_limit_buckets WHERE policy_key=$1",
      [policyKey]
    );
    assert.equal(persisted.rows[0]?.request_count,"8");
    assert.equal(persisted.rows[0]?.max_requests,"3");
    assert.equal(persisted.rows[0]?.window_seconds,60);
  }finally{
    if(setup){
      await setup.query("DELETE FROM api_rate_limit_buckets WHERE policy_key=$1",[policyKey]).catch(()=>undefined);
      await setup.end().catch(()=>undefined);
    }
    await Promise.all(workers.map(c=>c.end().catch(()=>undefined)));
  }
});

test("L13.2 rate-limit state is isolated by policy and privacy-preserving scope hash",{skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"},async()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const policyA="test-isolation:"+randomUUID();
  const policyB="test-isolation:"+randomUUID();
  try{
    await client.connect();
    const repo=new ApiAbuseRepository(client);
    const a=await repo.consume({policyKey:policyA,scopeSecret:"same-secret",now:"2026-10-05T10:01:12.000Z",maxRequests:2,windowSeconds:60});
    const b=await repo.consume({policyKey:policyB,scopeSecret:"same-secret",now:"2026-10-05T10:01:12.000Z",maxRequests:2,windowSeconds:60});
    assert.equal(a.requestCount,1);
    assert.equal(b.requestCount,1);
    assert.equal(a.scopeHash,b.scopeHash);
    assert.match(a.scopeHash,/^[a-f0-9]{64}$/);
    const raw=await client.query("SELECT scope_hash FROM api_rate_limit_buckets WHERE policy_key IN ($1,$2) ORDER BY policy_key",[policyA,policyB]);
    assert.equal(raw.rows.length,2);
    assert.ok(raw.rows.every(row=>row.scope_hash!=="same-secret"));
  }finally{
    await client.query("DELETE FROM api_rate_limit_buckets WHERE policy_key IN ($1,$2)",[policyA,policyB]).catch(()=>undefined);
    await client.end().catch(()=>undefined);
  }
});
