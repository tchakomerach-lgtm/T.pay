import {strict as assert} from "node:assert";
import {test} from "node:test";
import {assertHttpsOrigin,hashCredential,DeviceTrustRepository} from "../packages/api-gateway/src/auth-device.js";
test("L13.1 hashes credentials without exposing plaintext",()=>{const h=hashCredential("1234567890abcdef");assert.match(h,/^[a-f0-9]{64}$/);assert.notEqual(h,"1234567890abcdef");});
test("L13.1 rejects HTTP adapters",()=>{assert.throws(()=>assertHttpsOrigin("http://api.example.tg"),/AUTH_HTTPS_REQUIRED/);assert.doesNotThrow(()=>assertHttpsOrigin("https://api.example.tg"));});

test("L13.1 rejects a session whose actor differs from its device",async()=>{
 const calls:string[]=[];
 const db={query:async(sql:string)=>{calls.push(sql);return {rows:[{id:"session-1",organization_id:"org-1",actor_id:"actor-1",device_id:"device-1",status:"active",issued_at:"2026-11-16T08:00:00.000Z",expires_at:"2026-11-16T10:00:00.000Z",trust_epoch:3,device_actor_id:"actor-2",device_organization_id:"org-1",device_status:"active",device_epoch:3}],rowCount:1};}};
 const repository=new DeviceTrustRepository(db);
 const result=await repository.validateSession({sessionCredential:"1234567890abcdef",now:"2026-11-16T08:30:00.000Z"});
 assert.deepEqual(result,{valid:false});
 assert.equal(calls.length,1,"invalid device binding must not update session activity");
});
test("L13.1 rejects a session whose organization differs from its device",async()=>{
 const db={query:async()=>({rows:[{id:"session-1",organization_id:"org-1",actor_id:"actor-1",device_id:"device-1",status:"active",issued_at:"2026-11-16T08:00:00.000Z",expires_at:"2026-11-16T10:00:00.000Z",trust_epoch:3,device_actor_id:"actor-1",device_organization_id:"org-2",device_status:"active",device_epoch:3}],rowCount:1})};
 const result=await new DeviceTrustRepository(db).validateSession({sessionCredential:"1234567890abcdef",now:"2026-11-16T08:30:00.000Z"});
 assert.deepEqual(result,{valid:false});
});
test("L13.1 rejects a session issued in the future",async()=>{
 const db={query:async()=>({rows:[{id:"session-1",organization_id:"org-1",actor_id:"actor-1",device_id:"device-1",status:"active",issued_at:"2026-11-16T09:00:00.000Z",expires_at:"2026-11-16T10:00:00.000Z",trust_epoch:3,device_actor_id:"actor-1",device_organization_id:"org-1",device_status:"active",device_epoch:3}],rowCount:1})};
 const result=await new DeviceTrustRepository(db).validateSession({sessionCredential:"1234567890abcdef",now:"2026-11-16T08:30:00.000Z"});
 assert.deepEqual(result,{valid:false});
});
test("L13.1 accepts a session bound to its active device",async()=>{
 let calls=0;
 const db={query:async()=>{calls++;return calls===1?{rows:[{id:"session-1",organization_id:"org-1",actor_id:"actor-1",device_id:"device-1",status:"active",issued_at:"2026-11-16T08:00:00.000Z",expires_at:"2026-11-16T10:00:00.000Z",trust_epoch:3,device_actor_id:"actor-1",device_organization_id:"org-1",device_status:"active",device_epoch:3}],rowCount:1}:{rows:[],rowCount:1};}};
 const result=await new DeviceTrustRepository(db).validateSession({sessionCredential:"1234567890abcdef",now:"2026-11-16T08:30:00.000Z"});
 assert.equal(result.valid,true);
 assert.equal(result.sessionId,"session-1");
 assert.equal(calls,2,"valid session updates last_seen_at after binding checks");
});
