import {strict as assert} from "node:assert";
import {test} from "node:test";
import {ChannelIngressRepository} from "../packages/api-gateway/src/channel-repository.js";
import {normalizeChannelIngress} from "../packages/api-gateway/src/channel-ingress.js";

function ingress(payload:string){
  return normalizeChannelIngress({
    channel:"agent",method:"POST",route:"/v1/profile",origin:"https://api.tpay.tg",
    correlationId:"corr-123456",idempotencyKey:"idem-123456",scopeSecret:"agent-secret-123",payload
  });
}

test("L13.4 rejects a same-key different-payload replay as conflict",async()=>{
  const rows=new Map<string,any>();
  const db={query:async(sql:string,values?:unknown[])=>{
    if(sql.includes("INSERT INTO api_channel_ingress_events")){
      const key=String(values?.[2]);
      if(rows.has(key))return {rows:[],rowCount:0};
      const id=String(values?.[0]); rows.set(key,{id,payload_hash:String(values?.[6]),state:"accepted"});
      return {rows:[{id}],rowCount:1};
    }
    if(sql.includes("SELECT id,payload_hash,state")){
      const key=String(values?.[2]); const row=rows.get(key);
      return {rows:row?[row]:[],rowCount:row?1:0};
    }
    if(sql.startsWith("UPDATE api_channel_ingress_events"))return {rows:[],rowCount:1};
    throw new Error("UNEXPECTED_QUERY");
  }};
  const repo=new ChannelIngressRepository(db);
  const first=await repo.record(ingress("one"));
  const second=await repo.record(ingress("one"));
  const conflict=await repo.record(ingress("two"));
  assert.equal(first.state,"accepted");
  assert.equal(second.state,"replay");
  assert.equal(conflict.state,"conflict");
});

test("L13.4 preserves tenant scope on ingress records",async()=>{
  let valuesCaptured:unknown[]|undefined;
  const db={query:async(sql:string,values?:unknown[])=>{
    valuesCaptured=values;
    return {rows:[{id:"ingress-1"}],rowCount:1};
  }};
  const repo=new ChannelIngressRepository(db);
  const result=await repo.record(ingress("one"),"org-1");
  assert.equal(result.state,"accepted");
  assert.equal(valuesCaptured?.[1],"org-1");
});

test("L13.4 quarantines a duplicate offline sequence in PostgreSQL",{skip:!process.env.TPAY_DATABASE_URL&&"TPAY_DATABASE_URL is not configured"},async()=>{
  const pg=await import("pg");
  const {join}=await import("node:path");
  const {pathToFileURL}=await import("node:url");
  const {applyMigrations}=await import("../packages/finance/src/postgres-migrations.js");
  const client=new pg.default.Client({connectionString:process.env.TPAY_DATABASE_URL});
  try{
    await client.connect();
    await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    const repo=new ChannelIngressRepository(client);
    const first=await repo.record(normalizeChannelIngress({
      channel:"agent",method:"POST",route:"/v1/profile",origin:"https://api.tpay.tg",
      correlationId:"corr-seq-1",idempotencyKey:"idem-seq-1",scopeSecret:"agent-secret-seq-1",payload:"one",sequenceNo:"7"
    }));
    const second=await repo.record(normalizeChannelIngress({
      channel:"agent",method:"POST",route:"/v1/profile",origin:"https://api.tpay.tg",
      correlationId:"corr-seq-2",idempotencyKey:"idem-seq-2",scopeSecret:"agent-secret-seq-1",payload:"two",sequenceNo:"7"
    }));
    assert.equal(first.state,"accepted");
    assert.equal(second.state,"quarantined");
  }finally{await client.end().catch(()=>undefined);}
});
