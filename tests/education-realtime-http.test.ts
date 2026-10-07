import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";
import { SchoolRealtimeHub } from "../packages/education/src/school-realtime.js";
const auth=()=>({principal:{userId:"teacher-1",organizationId:"org-1",permissions:["member.manage","org.read"] as const,sessionId:"s1"},session:{sessionId:"s1",userId:"teacher-1",organizationId:"org-1",createdAt:0,expiresAt:Date.now()+60000,assurance:"standard" as const}});
test("authenticated School SSE stream receives only its organization events",async()=>{
 const hub=new SchoolRealtimeHub(); const db={async query(){return {rows:[],rowCount:0}}};
 const server=createSchoolApiServer({db:db as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,realtime:hub});
 await new Promise<void>(resolve=>server.listen(0,resolve));server.unref();const port=(server.address() as any).port;
 const controller=new AbortController();
 const response=await fetch(`http://127.0.0.1:${port}/v1/education/events/stream`,{signal:controller.signal});
 assert.equal(response.status,200);assert.equal(response.headers.get("content-type")?.startsWith("text/event-stream"),true);
 const reader=response.body!.getReader(); await reader.read(); 
 hub.publish({id:"evt-1",tenantId:"org-1",organizationId:"org-1",type:"attendance.changed",occurredAt:new Date().toISOString(),entityId:"s1",version:1,data:{operation:"POST"}});
 const chunk=await reader.read(); const text=new TextDecoder().decode(chunk.value); assert.match(text,/evt-1/);
 controller.abort();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
});
