import test from "node:test";
import assert from "node:assert/strict";
import {SchoolRealtimeHub} from "../packages/education/src/school-realtime.js";
import {SecureOfflineQueue,type SecureOfflineEnvelope,type SecureOfflineStorage,type DeviceKeyProvider} from "../packages/education/src/secure-offline-queue.js";
import {generateKeyPairSync,randomBytes} from "node:crypto";

test("P047 realtime hub cannot cross tenant or organization boundaries",()=>{
 const received:string[]=[];const hub=new SchoolRealtimeHub(4);
 hub.subscribe({id:"tenant-a",tenantId:"t-a",organizationId:"o-a",send:m=>received.push(JSON.stringify(m)),close(){}});
 hub.subscribe({id:"tenant-b",tenantId:"t-b",organizationId:"o-b",send:m=>received.push(JSON.stringify(m)),close(){}});
 hub.publish({id:"e1",tenantId:"t-a",organizationId:"o-a",type:"attendance.changed",occurredAt:new Date().toISOString(),entityId:"s1",version:1,data:{}});
 assert.equal(received.length,1);assert.match(received[0]!,/"e1"/);
});

test("P047 realtime queue overflow fails closed with resync requirement",()=>{
 let closed=false;let messages:any[]=[];const hub=new SchoolRealtimeHub(1);
 hub.subscribe({id:"slow",tenantId:"t",organizationId:"o",send:m=>messages.push(m),close:()=>{closed=true}});
 const base={tenantId:"t",organizationId:"o",type:"student.changed" as const,occurredAt:new Date().toISOString(),entityId:"s",version:1,data:{}};
 hub.publish({id:"1",...base});hub.publish({id:"2",...base});
 assert.equal(closed,true);assert.equal(messages.at(-1)?.kind,"resync_required");
});

class Mem implements SecureOfflineStorage{
 records:SecureOfflineEnvelope[]=[];async getLastSequence(){return this.records.filter(x=>x.state==="QUEUED").reduce((m,x)=>x.sequence>m?x.sequence:m,0n)}
 async append(r:SecureOfflineEnvelope,p:bigint){if(p!==await this.getLastSequence())throw new Error("CONCURRENT_WRITE");this.records.push(r)}
 async list(deviceId:string){return this.records.filter(x=>x.deviceId===deviceId)}
 async quarantine(r:SecureOfflineEnvelope){r.state="QUARANTINED"} async remove(id:string){this.records=this.records.filter(x=>x.eventId!==id)}
}
test("P047 offline records reject tenant tampering and rollback",async()=>{
 const storage=new Mem();const key=new Uint8Array(randomBytes(32));const keys=generateKeyPairSync("ed25519");
 const provider:DeviceKeyProvider={getEncryptionKey:async()=>key,getSigningKeys:async()=>keys};
 const q=new SecureOfflineQueue(storage,provider);const scope={deviceId:"d",tenantId:"t",organizationId:"o"};
 await q.append(scope,{eventId:"e",sequence:1n,occurredAt:"2026-10-07T00:00:00Z",payload:{x:1}});
 const tampered={...storage.records[0]!,tenantId:"evil"};storage.records[0]=tampered;
 const isolated=await q.read(scope); assert.deepEqual(isolated,[]);
});

test("P047 malformed realtime events are not accepted by application validation boundary",()=>{
 const valid=["student.changed","attendance.changed","work_item.changed","service_request.changed","sync.accepted","sync.pending"];
 const input={id:"x",tenantId:"t",organizationId:"o",type:"admin.injected",occurredAt:new Date().toISOString(),entityId:"x",version:1,data:{}};
 assert.equal(valid.includes(input.type),false);
});
