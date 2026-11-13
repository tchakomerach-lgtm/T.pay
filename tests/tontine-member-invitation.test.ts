import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";

const groupId="123e4567-e89b-42d3-a456-426614174000";
const clientId="123e4567-e89b-42d3-a456-426614174001";
const actorId="123e4567-e89b-42d3-a456-426614174002";

function makeServer(options:{occupied?:number;maxMembers?:number}={}){
 const statements:string[]=[];
 const server=createSchoolApiServer({
  db:{query:async()=>({rows:[],rowCount:0})} as any,
  authenticate:async()=>({
   principal:{userId:actorId,organizationId:"org-1",permissions:["member.manage","org.read","org.manage"] as const,sessionId:"s1"},
   tenantId:"tenant-1",
   session:{sessionId:"s1",userId:actorId,organizationId:"org-1",createdAt:0,expiresAt:Date.now()+60000,assurance:"standard" as const}
  }),
  syncClient:()=>({
   query:async(sql:string,values?:unknown[])=>{
    statements.push(sql);
    if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:values?.[0]}],rowCount:1};
    if(sql.includes("SELECT id,status,max_members FROM tontine_groups"))return {rows:[{id:groupId,status:"active",max_members:options.maxMembers??5}],rowCount:1};
    if(sql.includes("SELECT count(*)::integer AS occupied"))return {rows:[{occupied:options.occupied??2}],rowCount:1};
    if(sql.includes("INSERT INTO tontine_memberships"))return {rows:[{id:values?.[0],group_id:groupId,client_id:clientId,role:"member",status:"pending",joined_at:new Date().toISOString(),selected_microfinance_id:null}],rowCount:1};
    return {rows:[],rowCount:1};
   },
   release:()=>{}
  }) as any
 });
 return {server,statements};
}

test("Community Tontine invitation is pending, idempotent-keyed, audited and emitted atomically",async()=>{
 const {server,statements}=makeServer();
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/members`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-invite-0001"},
   body:JSON.stringify({clientId})
  });
  const body=await response.json() as any;
  assert.equal(response.status,201,JSON.stringify(body));
  assert.equal(body.ok,true);
  assert.equal(body.data.membership.status,"pending");
  assert.equal(body.data.membership.role,"member");
  assert.ok(statements.includes("BEGIN"));
  assert.ok(statements.some(sql=>sql.includes("FOR UPDATE")));
  assert.ok(statements.some(sql=>sql.includes("status IN ('pending','active')")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO tontine_memberships")));
  assert.ok(statements.some(sql=>sql.includes("tontine.member.invited")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO api_request_audit")));
  assert.equal(statements.at(-1),"COMMIT");
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test("Community Tontine invitation enforces capacity under the group lock",async()=>{
 const {server,statements}=makeServer({occupied:3,maxMembers:3});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/members`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-invite-0002"},
   body:JSON.stringify({clientId})
  });
  assert.equal(response.status,409);
  assert.ok(statements.some(sql=>sql.includes("FOR UPDATE")));
  assert.ok(!statements.some(sql=>sql.includes("INSERT INTO tontine_memberships")));
  assert.equal(statements.at(-1),"ROLLBACK");
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test("Community Tontine invitation rejects malformed client IDs before opening a transaction",async()=>{
 const {server,statements}=makeServer();
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/members`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-invite-0003"},
   body:JSON.stringify({clientId:"not-a-uuid"})
  });
  assert.equal(response.status,400);
  assert.equal(statements.length,0);
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
