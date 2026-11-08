import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";

function auth(){
 return {principal:{userId:"teacher-1",organizationId:"org-1",permissions:["member.manage","org.read"] as const,sessionId:"s1"},tenantId:"tenant-1",session:{sessionId:"s1",userId:"teacher-1",organizationId:"org-1",createdAt:0,expiresAt:Date.now()+60000,assurance:"standard" as const}};
}
function mutationClient(){
 const statements:string[]=[];
 return {statements,async query(sql:string){
  statements.push(sql);
  if(sql.includes("SELECT actor_id"))return {rows:[{actor_id:"teacher-1",organization_id:"org-1",kind:"TEACHER",active:true,data:{display_name:"Teacher"},version:1,updated_at:new Date().toISOString()}],rowCount:1};
  return {rows:[],rowCount:0};
 },release(){}};
}
function db(){
 const rows:any[]=[];
 return {rows,async query(sql:string,values?:unknown[]){ if(sql.includes("SELECT actor_id"))return {rows:[{actor_id:"teacher-1",organization_id:"org-1",kind:"TEACHER",active:true,data:{display_name:"Teacher"},version:1,updated_at:new Date().toISOString()}],rowCount:1}; return {rows:[],rowCount:0}; }};
}
test("School HTTP actor route enforces auth context and returns versioned contract",async()=>{
 const tx=mutationClient();
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,mutationClient:()=>tx as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port; server.unref(); server.unref();
 const res=await fetch(`http://127.0.0.1:${port}/v1/education/actors/teacher-1`);
 const body=await res.json() as any;
 assert.equal(res.status,200,JSON.stringify(body)); assert.equal(body.ok,true); assert.equal(body.version,"v1"); assert.equal(body.data.actor_id,"teacher-1");
 assert.ok(tx.statements.some(sql=>sql==="SET LOCAL ROLE tpay_school_runtime"));
 assert.ok(tx.statements.some(sql=>sql.includes("set_config('tpay.tenant_id'")));
 assert.ok(tx.statements.some(sql=>sql.includes("SELECT actor_id")&&sql.includes("education_actors")));
 server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
});
test("School HTTP rejects mutation without idempotency key",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,mutationClient:()=>mutationClient() as any});
 await new Promise<void>(resolve=>server.listen(0,resolve)); const port=(server.address() as any).port;
 const res=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
 assert.equal(res.status,400); await new Promise<void>(resolve=>server.close(()=>resolve()));
});


test("P047 HTTP rejects oversized payloads and malformed realtime cursors",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,mutationClient:()=>mutationClient() as any,realtime:{subscribe(){throw new Error("unexpected-subscribe");}} as any,realtimeStore:{replay:async()=>{throw new Error("unexpected-replay");}} as any});
 await new Promise<void>(resolve=>server.listen(0,resolve)); const port=(server.address() as any).port;
 try{
  const oversized=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"047-large"},body:JSON.stringify({blob:"x".repeat(1024*1024+1)})});
  assert.equal(oversized.status,400);
  const malformed=await fetch(`http://127.0.0.1:${port}/v1/education/events/stream`,{headers:{"last-event-id":"not-a-sequence"}});
  assert.equal(malformed.status,400);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("P048 fortress HTTP boundaries emit security headers and reject malformed control metadata",async()=>{
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,mutationClient:()=>mutationClient() as any});
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
 const server=createSchoolApiServer({db:db() as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,mutationClient:()=>mutationClient() as any,realtime:{subscribe(){return ()=>{};},ack(){}} as any});
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


test("failed idempotency reservation is finalized within its organization scope",async()=>{
 const requestId="00000000-0000-4000-8000-000000000123";
 const statements:{sql:string;values?:unknown[]}[]=[];
 const database={async query(sql:string,values?:unknown[]){
  statements.push({sql,values});
  if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:requestId}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
 const principal=auth();
 principal.principal.permissions=["org.manage"] as const;
 const server=createSchoolApiServer({db:database as any,authenticate:async()=>principal,syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/education/classes`,{
   method:"POST",
   headers:{"content-type":"application/json","x-idempotency-key":"school-class-invalid-payload"},
   body:JSON.stringify({unexpected:"field"})
  });
  assert.equal(response.status,400);
  const failed=statements.find(x=>x.sql.includes("UPDATE api_request_deduplication SET state='failed'"));
  assert.ok(failed);
  assert.match(failed!.sql,/organization_id=\$4/);
  assert.equal(failed!.values?.[0],requestId);
  assert.equal(failed!.values?.[3],"org-1");
 }finally{server.close();}
});
