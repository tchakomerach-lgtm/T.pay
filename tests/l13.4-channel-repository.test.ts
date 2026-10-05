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
