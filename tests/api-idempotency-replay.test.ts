import test from "node:test";
import assert from "node:assert/strict";
import {ApiGatewayRepository} from "../packages/api-gateway/src/repository.js";

test("server idempotency replays stored response body",async()=>{
 let call=0;
 const db={query:async(sql:string,values?:unknown[])=>{
  call++;
  if(call===1)return {rows:[{id:"req-1"}],rowCount:1};
  if(call===2)return {rows:[{id:"req-1",request_hash:"a".repeat(64),route:"/v1/test",state:"succeeded",response_hash:"b".repeat(64),response_body:'{"ok":true}',status_code:200}],rowCount:1};
  throw new Error("unexpected query");
 }};
 const repo=new ApiGatewayRepository(db);
 const out=await repo.reserveOrReplay({key:"user:key",requestHash:"a".repeat(64),route:"/v1/test",expiresAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal(out.status,"reserved");
 const replay=await repo.reserveOrReplay({key:"user:key",requestHash:"a".repeat(64),route:"/v1/test",expiresAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal(replay.status,"replay");
 assert.equal(replay.responseBody,'{"ok":true}');
});

test("server idempotency rejects same key with different request",async()=>{
 let call=0;
 const db={query:async()=>++call===1?{rows:[{id:"req-1"}],rowCount:1}:{rows:[{id:"req-1",request_hash:"b".repeat(64),route:"/v1/test",state:"reserved"}],rowCount:1}};
 const repo=new ApiGatewayRepository(db);
 const out=await repo.reserveOrReplay({key:"user:key",requestHash:"a".repeat(64),route:"/v1/test",expiresAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal(out.status,"reserved");
 const conflict=await repo.reserveOrReplay({key:"user:key",requestHash:"c".repeat(64),route:"/v1/test",expiresAt:new Date(Date.now()+3600000).toISOString()});
 assert.equal(conflict.status,"conflict");
});
