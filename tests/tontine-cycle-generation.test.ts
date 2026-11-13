import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";

const groupId="123e4567-e89b-42d3-a456-426614174000";
const actorId="123e4567-e89b-42d3-a456-426614174001";
const memberOne="123e4567-e89b-42d3-a456-426614174002";
const memberTwo="123e4567-e89b-42d3-a456-426614174003";

function serverFor(options:{members?:number}={}){
 const statements:string[]=[];
 const server=createSchoolApiServer({
  db:{query:async()=>({rows:[],rowCount:0})} as any,
  authenticate:async()=>({
   principal:{userId:actorId,organizationId:"org-1",permissions:["org.manage","org.read"] as const,sessionId:"s1"},
   tenantId:"tenant-1",
   session:{sessionId:"s1",userId:actorId,organizationId:"org-1",createdAt:0,expiresAt:Date.now()+60000,assurance:"standard" as const}
  }),
  syncClient:()=>({
   query:async(sql:string,values?:unknown[])=>{
    statements.push(sql);
    if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:values?.[0]}],rowCount:1};
    if(sql.includes("SELECT id,status,cycle_number,frequency"))return {rows:[{id:groupId,status:"active",cycle_number:1,frequency:"weekly",contribution_mode:"fixed",fixed_amount_minor:"500",minimum_amount_minor:"200",currency:"XOF"}],rowCount:1};
    if(sql.includes("SELECT id,client_id FROM tontine_memberships"))return {rows:(options.members??2)>=2?[{id:memberOne,client_id:memberOne},{id:memberTwo,client_id:memberTwo}]:[{id:memberOne,client_id:memberOne}],rowCount:options.members??2};
    if(sql.includes("INSERT INTO tontine_cycles"))return {rows:[{id:values?.[0],group_id:groupId,cycle_number:1,starts_on:"2026-11-16",ends_on:"2026-11-22",status:"scheduled",rules_version:"v1",minimum_amount_minor:"200",currency:"XOF"}],rowCount:1};
    return {rows:[],rowCount:1};
   },
   release:()=>{}
  }) as any
 });
 return {server,statements};
}

test("Community Tontine cycle generation atomically creates member schedules and beneficiary rotation slots",async()=>{
 const {server,statements}=serverFor();
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/cycles`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-cycle-create-001"},
   body:JSON.stringify({startsOn:"2026-11-16",endsOn:"2026-11-22",rulesVersion:"v1"})
  });
  const body=await response.json() as any;
  assert.equal(response.status,201,JSON.stringify(body));
  assert.equal(body.data.cycle.status,"scheduled");
  assert.ok(statements.includes("BEGIN"));
  assert.ok(statements.some(sql=>sql.includes("FOR UPDATE")));
  assert.equal(statements.filter(sql=>sql.includes("INSERT INTO tontine_member_schedules")).length,2);
  assert.equal(statements.filter(sql=>sql.includes("INSERT INTO tontine_beneficiary_slots")).length,2);
  assert.ok(statements.some(sql=>sql.includes("UPDATE tontine_groups SET cycle_number")));
  assert.ok(statements.some(sql=>sql.includes("tontine.cycle.generated")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO api_request_audit")));
  assert.equal(statements.at(-1),"COMMIT");
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test("Community Tontine cycle generation rejects groups with fewer than two active members",async()=>{
 const {server,statements}=serverFor({members:1});
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/cycles`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-cycle-create-002"},
   body:JSON.stringify({startsOn:"2026-11-16",endsOn:"2026-11-22",rulesVersion:"v1"})
  });
  assert.equal(response.status,409);
  assert.ok(!statements.some(sql=>sql.includes("INSERT INTO tontine_cycles")));
  assert.equal(statements.at(-1),"ROLLBACK");
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test("Community Tontine cycle generation validates dates before opening a transaction",async()=>{
 const {server,statements}=serverFor();
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const port=(server.address() as any).port;
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/cycles`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-cycle-create-003"},
   body:JSON.stringify({startsOn:"2026-02-30",endsOn:"2026-03-01",rulesVersion:"v1"})
  });
  assert.equal(response.status,400);
  assert.equal(statements.length,0);
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
