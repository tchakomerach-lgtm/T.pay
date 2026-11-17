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


test("attendance recorder identity is derived from the authenticated principal, never the request body",async()=>{
 const calls:Array<{sql:string;values:unknown[]|undefined}>=[];
 const database={async query(sql:string,values?:unknown[]){calls.push({sql,values});if(sql.includes("INSERT INTO api_idempotency"))return {rows:[{request_id:"request-1",state:"reserved"}],rowCount:1};return {rows:[],rowCount:1};}};
 const server=createSchoolApiServer({db:database as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/education/attendance`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"attendance-test-001"},body:JSON.stringify({studentId:"student-1",classId:"class-1",recordedBy:"attacker",organizationId:"other-org",status:"PRESENT",occurredAt:new Date().toISOString(),source:"TEACHER",version:1})});
  const insert=calls.find(c=>c.sql.includes("INSERT INTO education_attendance"));
  assert.ok(insert);
  assert.equal(insert.values?.[5],"teacher-1");
  assert.equal(insert.values?.[3],"org-1");
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test("student registry is tenant-scoped and lifecycle transitions use optimistic versions",async()=>{
 const calls:Array<{sql:string;values:unknown[]|undefined}>=[];
 let student:any={student_id:"student-001",tenant_id:"tenant-1",organization_id:"org-1",lifecycle:"ADMITTED",version:2,updated_at:new Date().toISOString()};
 const database={async query(sql:string,values?:unknown[]){
  calls.push({sql,values});
  if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:"request-1"}],rowCount:1};
  if(sql.includes("SELECT student_id,organization_id,lifecycle,version FROM education_students"))return {rows:[{student_id:student.student_id,organization_id:student.organization_id,lifecycle:student.lifecycle,version:student.version}],rowCount:1};
  if(sql.includes("UPDATE education_students SET lifecycle")){student={...student,lifecycle:values?.[0],version:Number(values?.[1])};return {rows:[student],rowCount:1};}
  if(sql.includes("INSERT INTO api_request_audit"))return {rows:[],rowCount:1};
  if(sql.includes("UPDATE api_request_deduplication"))return {rows:[],rowCount:1};
  if(sql.includes("SELECT student_id,tenant_id,organization_id,lifecycle,version,updated_at FROM education_students"))return {rows:[student],rowCount:1};
  return {rows:[],rowCount:0};
 }};
 const server=createSchoolApiServer({db:database as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));const port=(server.address() as any).port;
 try{
  const get=await fetch(`http://127.0.0.1:${port}/v1/education/students/student-001`);
  assert.equal(get.status,200);
  const transition=await fetch(`http://127.0.0.1:${port}/v1/education/students/student-001/lifecycle`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"student-lifecycle-001"},body:JSON.stringify({lifecycle:"ENROLLED"})});
  const body=await transition.json() as any;
  assert.equal(transition.status,200,JSON.stringify(body));
  assert.equal(body.data.lifecycle,"ENROLLED");
  const update=calls.find(c=>c.sql.includes("UPDATE education_students SET lifecycle"));
  assert.equal(update?.values?.[2],"tenant-1");
  assert.equal(update?.values?.[3],"org-1");
  assert.equal(update?.values?.[5],"2");
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test("class and enrollment APIs bind tenant, organization and actor to authenticated session",async()=>{
 const calls:any[]=[];
 const database={async query(sql:string,values?:unknown[]){calls.push({sql,values});if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:"request-edu-1"}],rowCount:1};if(sql.includes("INSERT INTO education_classes"))return {rows:[{class_id:values?.[0],academic_year:values?.[3],label:values?.[4],capacity:values?.[5],enrolled_count:0,status:"ACTIVE",version:1}],rowCount:1};if(sql.includes("INSERT INTO education_enrollments"))return {rows:[{enrollment_id:values?.[0],student_id:values?.[3],class_id:values?.[4],academic_year:values?.[5],status:values?.[6],created_by:values?.[7],version:1}],rowCount:1};return {rows:[],rowCount:1};}};
 const server=createSchoolApiServer({db:database as any,authenticate:async()=>auth(),syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));const port=(server.address() as any).port;
 try{
  const base="http://127.0.0.1:"+port+"/v1/education/";
  const cr=await fetch(base+"classes",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"class-create-0001"},body:JSON.stringify({classId:"class-6e-a",academicYear:"2026-2027",label:"6e A",capacity:35,tenantId:"spoof",organizationId:"spoof"})});
  const cb:any=await cr.json();assert.equal(cr.status,200,JSON.stringify(cb));assert.equal(cb.data.class_id,"class-6e-a");
  const ci=calls.find(c=>c.sql.includes("INSERT INTO education_classes"));assert.deepEqual(ci.values,["class-6e-a","tenant-1","org-1","2026-2027","6e A",35]);
  const er=await fetch(base+"enrollments",{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"enrollment-create-01"},body:JSON.stringify({enrollmentId:"enrollment-001",studentId:"student-001",classId:"class-6e-a",academicYear:"2026-2027",status:"CONFIRMED",createdBy:"attacker",organizationId:"spoof"})});
  const eb:any=await er.json();assert.equal(er.status,200,JSON.stringify(eb));assert.equal(eb.data.created_by,"teacher-1");
  const ei=calls.find(c=>c.sql.includes("INSERT INTO education_enrollments"));assert.equal(ei.values[1],"tenant-1");assert.equal(ei.values[2],"org-1");assert.equal(ei.values[7],"teacher-1");
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
