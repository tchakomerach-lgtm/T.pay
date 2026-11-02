import assert from "node:assert/strict";
import test from "node:test";
import { SchoolRealtimeHub, toSseMessage, type SchoolRealtimeEvent } from "../packages/education/src/school-realtime.js";
const event=(id:string,org="o1"):SchoolRealtimeEvent=>({id,tenantId:"t1",organizationId:org,type:"attendance.changed",occurredAt:new Date().toISOString(),entityId:"s1",version:1,data:{status:"PRESENT"}});
test("realtime isolates tenant and organization subscribers",()=>{
 const hub=new SchoolRealtimeHub(); const a:any[]=[];const b:any[]=[];
 const unsub=hub.subscribe({id:"a",tenantId:"t1",organizationId:"o1",send:m=>a.push(m),close:()=>{}});
 hub.subscribe({id:"b",tenantId:"t1",organizationId:"o2",send:m=>b.push(m),close:()=>{}});
 hub.publish(event("e1","o1")); assert.equal(a.length,1);assert.equal(b.length,0);hub.ack("a");unsub();
});
test("realtime emits deterministic SSE frames",()=>{
 const s=toSseMessage({kind:"event",event:event("e2")}); assert.match(s,/^id: e2\nevent: event\ndata:/);assert.match(s,/\n\n$/);
});
test("realtime closes slow subscribers after bounded queue overflow",()=>{
 const hub=new SchoolRealtimeHub(1);let closed=0;const received:any[]=[];
 hub.subscribe({id:"slow",tenantId:"t1",organizationId:"o1",send:m=>{received.push(m)},close:()=>closed++});
 hub.publish(event("e1")); hub.publish(event("e2")); assert.equal(closed,1); assert.equal(received.at(-1)?.kind,"resync_required");
});

test("P052 uses durable stream sequence as SSE Last-Event-ID cursor",()=>{
 const e={...event("uuid-event"),streamSequence:"42"};
 const s=toSseMessage({kind:"event",event:e});assert.match(s,/^id: 42\nevent: event/);
});
test("P052 falls back to event id only for transient events without durable sequence",()=>{
 const s=toSseMessage({kind:"event",event:event("transient")});assert.match(s,/^id: transient\nevent: event/);
});

test("P056.1 hub suppresses duplicate delivery for the same durable event id",()=>{
 const hub=new SchoolRealtimeHub();const received:any[]=[];
 hub.subscribe({id:"dedupe",tenantId:"t1",organizationId:"o1",send:m=>received.push(m),close:()=>{}});
 hub.publish(event("durable-event"));
 hub.publish(event("durable-event"));
 assert.equal(received.length,1);
});
test("P056.1 one broken subscriber cannot block delivery to other subscribers",()=>{
 const hub=new SchoolRealtimeHub();const received:any[]=[];let closed=0;
 hub.subscribe({id:"broken",tenantId:"t1",organizationId:"o1",send:()=>{throw new Error("socket closed");},close:()=>{closed++;}});
 hub.subscribe({id:"healthy",tenantId:"t1",organizationId:"o1",send:m=>received.push(m),close:()=>{}});
 hub.publish(event("durable-event-2"));
 assert.equal(closed,1);assert.equal(received.length,1);
});
