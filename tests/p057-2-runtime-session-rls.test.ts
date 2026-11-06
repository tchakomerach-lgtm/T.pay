import test from "node:test";
import assert from "node:assert/strict";
import {DeviceTrustRepository,issueTenantBoundSessionCredential} from "../packages/api-gateway/src/auth-device.js";

test("P057.2 session validation executes through the tenant runtime transaction",async()=>{
 const statements:string[]=[];
 const tx={query:async(sql:string,values?:unknown[])=>{
  statements.push(sql);
  if(sql.startsWith("SELECT s.id"))return {rows:[{id:"s1",tenant_id:"tenant-a",organization_id:"org-a",actor_id:"actor-a",device_id:"d1",status:"active",issued_at:"2026-11-06T00:00:00.000Z",expires_at:"2026-11-07T00:00:00.000Z",trust_epoch:1,device_status:"active",device_epoch:1}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
 let routedTenant="";
 const db={
  query:async()=>{throw new Error("POOL_LEVEL_QUERY_FORBIDDEN");},
  withTenantTransaction:async<T>(tenantId:string,work:(client:typeof tx)=>Promise<T>)=>{
   routedTenant=tenantId;
   return work(tx);
  }
 };
 const repository=new DeviceTrustRepository(db);
 const token=issueTenantBoundSessionCredential("tenant-a","e".repeat(32));
 const result=await repository.validateSession({sessionCredential:token,now:"2026-11-06T01:00:00.000Z"});
 assert.equal(result.valid,true);
 assert.equal(routedTenant,"tenant-a");
 assert.match(statements[0]!,/FOR SHARE OF s,d/);
 assert.match(statements[1]!,/tenant_id=\$2/);
});

test("P057.2 database failure during tenant runtime validation rejects the session",async()=>{
 const repository=new DeviceTrustRepository({
  query:async()=>({rows:[],rowCount:0}),
  withTenantTransaction:async()=>{throw new Error("RUNTIME_ROLE_UNAVAILABLE");}
 });
 await assert.rejects(()=>repository.validateSession({
  sessionCredential:issueTenantBoundSessionCredential("tenant-a","f".repeat(32)),
  now:"2026-11-06T01:00:00.000Z"
 }),/RUNTIME_ROLE_UNAVAILABLE/);
});
