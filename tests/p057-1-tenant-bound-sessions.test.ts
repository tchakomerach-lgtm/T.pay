import test from "node:test";
import assert from "node:assert/strict";
import {DeviceTrustRepository,issueTenantBoundSessionCredential,readSessionTenantId,hashCredential} from "../packages/api-gateway/src/auth-device.js";

test("P057.1 bearer embeds a tenant routing claim but stores only the full credential hash",()=>{
 const token=issueTenantBoundSessionCredential("tenant-a","a".repeat(32));
 assert.equal(readSessionTenantId(token),"tenant-a");
 assert.equal(hashCredential(token).length,64);
 assert.notEqual(hashCredential(token),token);
 assert.throws(()=>readSessionTenantId("legacy-unbound-token"),/AUTH_SESSION_TENANT_CLAIM_REQUIRED/);
});

test("P057.1 session validation is scoped to tenant and fails closed for legacy credentials",async()=>{
 const calls:Array<{sql:string;values?:unknown[]}>=[];
 const db={query:async(sql:string,values?:unknown[])=>{
  calls.push({sql,values});
  if(sql.startsWith("SELECT s.id"))return {rows:[{id:"session-1",tenant_id:"tenant-a",organization_id:"org-a",actor_id:"actor-a",device_id:"device-a",status:"active",issued_at:"2026-11-06T00:00:00.000Z",expires_at:"2026-11-07T00:00:00.000Z",trust_epoch:2,device_status:"active",device_epoch:2}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
 const repository=new DeviceTrustRepository(db);
 const legacy=await repository.validateSession({sessionCredential:"legacy-unbound-session-credential",now:"2026-11-06T01:00:00.000Z"});
 assert.deepEqual(legacy,{valid:false});
 const token=issueTenantBoundSessionCredential("tenant-a","b".repeat(32));
 const result=await repository.validateSession({sessionCredential:token,now:"2026-11-06T01:00:00.000Z"});
 assert.equal(result.valid,true);
 assert.equal(result.tenantId,"tenant-a");
 const select=calls.find(x=>x.sql.startsWith("SELECT s.id"));
 assert.ok(select);
 assert.match(select.sql,/s\.tenant_id=\$2/);
 assert.deepEqual(select.values?.[1],"tenant-a");
 const update=calls.find(x=>x.sql.startsWith("UPDATE api_sessions SET last_seen_at"));
 assert.match(update!.sql,/tenant_id=\$2/);
});

test("P057.1 session creation refuses a bearer whose tenant differs from persisted context",async()=>{
 const repository=new DeviceTrustRepository({query:async()=>({rows:[],rowCount:0})});
 await assert.rejects(()=>repository.createSession({
  tenantId:"tenant-a",actorId:"actor-a",organizationId:"org-a",deviceId:"device-a",
  sessionCredential:issueTenantBoundSessionCredential("tenant-b","c".repeat(32)),
  trustEpoch:1,issuedAt:"2026-11-06T00:00:00.000Z",expiresAt:"2026-11-06T01:00:00.000Z"
 }),/AUTH_SESSION_TENANT_MISMATCH/);
});

test("P057.1 session creation binds device, actor, tenant and trust epoch in one insert-select",async()=>{
 let statement="";
 let values:unknown[]=[];
 const repository=new DeviceTrustRepository({query:async(sql,params)=>{statement=sql;values=params??[];return {rows:[{id:"session-1"}],rowCount:1};}});
 await repository.createSession({
  tenantId:"tenant-a",actorId:"actor-a",organizationId:"org-a",deviceId:"device-a",
  sessionCredential:issueTenantBoundSessionCredential("tenant-a","d".repeat(32)),
  trustEpoch:3,issuedAt:"2026-11-06T00:00:00.000Z",expiresAt:"2026-11-06T01:00:00.000Z"
 });
 assert.match(statement,/FROM api_devices d WHERE d\.id=\$5 AND d\.tenant_id=\$2/);
 assert.match(statement,/d\.trust_epoch=\$7/);
 assert.equal(values[1],"tenant-a");
});
