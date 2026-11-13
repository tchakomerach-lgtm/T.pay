import assert from "node:assert/strict";
import test from "node:test";
import { request as httpRequest } from "node:http";
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

  const oversizedLength=await new Promise<number>((resolve,reject)=>{
   const request=httpRequest({hostname:"127.0.0.1",port,path:"/v1/education/attendance",method:"POST",headers:{"content-type":"application/json","content-length":String(1024*1024+1),"x-idempotency-key":"p049-length"}},response=>{
    response.resume();resolve(response.statusCode??0);
   });
   request.on("error",reject);
   request.end();
  });
  assert.equal(oversizedLength,400);

  const sse=await fetch(`http://127.0.0.1:${port}/v1/education/events/stream`,{headers:{accept:"text/event-stream"}});
  assert.equal(sse.status,200);
  assert.equal(sse.headers.get("x-content-type-options"),"nosniff");
  assert.equal(sse.headers.get("x-frame-options"),"DENY");
  assert.equal(sse.headers.get("cross-origin-resource-policy"),"same-origin");
  sse.body?.cancel();
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("Community Tontine portfolio read is authenticated, organization-scoped and audited",async()=>{
 const auditDb=db();
 let scopedSql="",scopedValues:unknown[]=[];
 const server=createSchoolApiServer({
  db:auditDb as any,
  authenticate:async()=>auth(),
  syncClient:()=>({
   query:async(sql:string,values?:unknown[])=>{
    if(sql.includes("SELECT g.id,g.name")){scopedSql=sql;scopedValues=values??[];return {rows:[{
     id:"group-1",name:"Solidarité",country_code:"TG",currency:"XOF",frequency:"daily",contribution_mode:"fixed",
     minimum_amount_minor:"1000",fixed_amount_minor:"2000",cycle_number:1,max_members:20,governance:"founder_managed",
     status:"active",active_member_count:8,pending_member_count:1,latest_cycle:null,
     confirmed_contribution_count:6,confirmed_contribution_minor:"12000"
    }],rowCount:1};}
    return {rows:[],rowCount:0};
   },
   release:()=>{}
  }) as any
 });
 await new Promise<void>(resolve=>server.listen(0,resolve)); const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups?status=active&limit=25`);
  const body=await response.json() as any;
  assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.ok,true);
  assert.equal(body.data.items.length,1);
  assert.equal(body.data.items[0].active_member_count,8);
  assert.match(scopedSql,/g\.organization_id=\$1/);
  assert.deepEqual(scopedValues.slice(0,2),["org-1","active"]);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test("Community Tontine member registry is organization-scoped, bounded and audited",async()=>{
 const auditDb=db();let sqlSeen="",valuesSeen:unknown[]=[];
 const server=createSchoolApiServer({db:auditDb as any,authenticate:async()=>auth(),syncClient:()=>({
  query:async(sql:string,values?:unknown[])=>{if(sql.includes("FROM tontine_memberships WHERE organization_id")){sqlSeen=sql;valuesSeen=values??[];return {rows:[{id:"member-1",client_id:"client-1",role:"member",status:"active"}],rowCount:1};}return {rows:[],rowCount:0};},release:()=>{}
 }) as any});
 await new Promise<void>(resolve=>server.listen(0,resolve));const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/123e4567-e89b-42d3-a456-426614174000/members?limit=25`);
  const body=await response.json() as any;
  assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.ok,true);assert.equal(body.data.items.length,1);
  assert.ok(sqlSeen.includes("organization_id=$1 AND group_id=$2"));assert.deepEqual(valuesSeen,["org-1","123e4567-e89b-42d3-a456-426614174000",25]);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
