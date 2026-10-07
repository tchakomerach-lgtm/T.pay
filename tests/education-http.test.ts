import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";

function auth(){
 return {principal:{userId:"teacher-1",organizationId:"org-1",permissions:["member.manage","org.read"] as const,sessionId:"s1"},tenantId:"tenant-1",session:{sessionId:"s1",userId:"teacher-1",organizationId:"org-1",createdAt:0,expiresAt:Date.now()+60000,assurance:"standard" as const}};
}
function db(){
 const rows:any[]=[];
 return {rows,async query(sql:string,values?:unknown[]){ if(sql.includes("SELECT actor_id"))return {rows:[{actor_id:"teacher-1",organization_id:"org-1",kind:"TEACHER",active:true,data:{display_name:"Teacher"},version:1,updated_at:new Date().toISOString()}],rowCount:1}; return {rows:[],rowCount:0}; }};
}
test("School HTTP actor route enforces auth context and returns versioned contract",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port; server.unref(); server.unref();
 const res=await fetch(`http://127.0.0.1:${port}/v1/education/actors/teacher-1`);
 const body=await res.json() as any;
 assert.equal(res.status,200,JSON.stringify(body)); assert.equal(body.ok,true); assert.equal(body.version,"v1"); assert.equal(body.data.actor_id,"teacher-1");
 server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
});
test("School HTTP rejects mutation without idempotency key",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve)); const port=(server.address() as any).port;
 const res=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 assert.equal(res.status,400); await new Promise<void>(resolve=>server.close(()=>resolve()));
});


test("P047 HTTP rejects oversized payloads and malformed realtime cursors",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,realtime:{subscribe(){throw new Error("unexpected-subscribe");}} as any,realtimeStore:{replay:async()=>{throw new Error("unexpected-replay");}} as any});
 await new Promise<void>(resolve=>server.listen(0,resolve)); const port=(server.address() as any).port;
 try{
  const oversized=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"047-large"},body:JSON.stringify({blob:"x".repeat(1024*1024+1)})});
  assert.equal(oversized.status,400);
  const malformed=await fetch(`http://127.0.0.1:${port}/v1/education/events/stream`,{headers:{"last-event-id":"not-a-sequence"}});
  assert.equal(malformed.status,400);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
