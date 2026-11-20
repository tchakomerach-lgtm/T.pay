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

test("P048 fortress HTTP boundaries emit security headers and reject malformed control metadata",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve)); const port=(server.address() as any).port;
 try{
  const ok=await fetch(`http://127.0.0.1:${port}/v1/education/actors/teacher-1`);
  assert.equal(ok.status,200);
  assert.equal(ok.headers.get("x-content-type-options"),"nosniff");
  assert.equal(ok.headers.get("cache-control"),"no-store");
  assert.equal(ok.headers.get("referrer-policy"),"no-referrer");
  assert.equal(ok.headers.get("strict-transport-security"),"max-age=31536000; includeSubDomains");

  const badContentType=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"text/plain","x-idempotency-key":"p048-content-type"},body:"{}"});
  assert.equal(badContentType.status,400);

  const badKey=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"bad key"},body:"{}"});
  assert.equal(badKey.status,400);

  const badCorrelation=await fetch(`http://127.0.0.1:${port}/v1/education/actors/teacher-1`,{headers:{"x-correlation-id":"bad correlation id"}});
  assert.equal(badCorrelation.status,400);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test("P049 fortress request envelope rejects oversized URL/header and emits hardened SSE headers",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,realtime:{subscribe(){return ()=>{};},ack(){}} as any});
 await new Promise<void>(resolve=>server.listen(0,resolve)); const port=(server.address() as any).port;
 try{
  const longUrl=await fetch(`http://127.0.0.1:${port}/v1/education/actors/teacher-1?${"x".repeat(2048)}`);
  assert.equal(longUrl.status,400);

  const longHeader=await fetch(`http://127.0.0.1:${port}/v1/education/actors/teacher-1`,{headers:{"x-correlation-id":"a".repeat(4097)}});
  assert.equal(longHeader.status,400);

  const oversizedLength=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json","content-length":String(1024*1024+1),"x-idempotency-key":"p049-length"},body:"{}"});
  assert.equal(oversizedLength.status,400);

  const sse=await fetch(`http://127.0.0.1:${port}/v1/education/events/stream`,{headers:{accept:"text/event-stream"}});
  assert.equal(sse.status,200);
  assert.equal(sse.headers.get("x-content-type-options"),"nosniff");
  assert.equal(sse.headers.get("x-frame-options"),"DENY");
  assert.equal(sse.headers.get("cross-origin-resource-policy"),"same-origin");
  sse.body?.cancel();
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test("School workspace read routes are tenant and organization scoped",async()=>{
 const calls:Array<{sql:string;values?:unknown[]}>=[];
 const records=[{work_item_id:"work-1",organization_id:"org-1",status:"OPEN",priority:"NORMAL",due_at:null,owner_actor_id:null,version:"1"}];
 const database={async query(sql:string,values?:unknown[]){calls.push({sql,values});if(sql.includes("FROM education_work_items"))return {rows:records,rowCount:1};return {rows:[],rowCount:0};}};
 const server=createSchoolApiServer({db:database as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/education/work-items`);
  const body=await response.json() as any;
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.data[0].work_item_id,"work-1");
  const read=calls.find(call=>call.sql.includes("FROM education_work_items"));
  assert.ok(read);
  assert.match(read.sql,/tenant_id=\$1 AND organization_id=\$2/);
  assert.deepEqual(read.values,["tenant-1","org-1"]);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("attendance mutations bind recorder identity and source to the authenticated server principal",async()=>{
 const calls:Array<{sql:string;values?:unknown[]}>=[];
 const database={async query(sql:string,values?:unknown[]){calls.push({sql,values});if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:"request-1"}],rowCount:1};if(sql.includes("SELECT * FROM education_attendance"))return {rows:[],rowCount:0};return {rows:[],rowCount:1};}};
 const server=createSchoolApiServer({db:database as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"attendance-forged-actor-001"},body:JSON.stringify({studentId:"student-1",classId:"class-1",status:"PRESENT",recordedBy:"attacker",source:"AUTHORIZED_DEVICE",version:1})});
  const body=await response.json() as any;
  assert.equal(response.status,200,JSON.stringify(body));
  const insert=calls.find(call=>call.sql.includes("INSERT INTO education_attendance"));
  assert.ok(insert);
  assert.equal(insert.values?.[5],"teacher-1");
  assert.equal(insert.values?.[7],"TEACHER");
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
