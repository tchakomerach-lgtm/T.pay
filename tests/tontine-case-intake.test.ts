import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";

const groupId="123e4567-e89b-42d3-a456-426614174000";
const contributionId="123e4567-e89b-42d3-a456-426614174003";
const actorId="123e4567-e89b-42d3-a456-426614174002";

function makeServer(options:{contributionExists?:boolean}={}){
 const statements:string[]=[];
 const eventTypes:string[]=[];
 const server=createSchoolApiServer({
  db:{query:async()=>({rows:[],rowCount:0})} as any,
  authenticate:async()=>({
   principal:{userId:actorId,organizationId:"org-1",permissions:["org.read","org.manage"] as const,sessionId:"s1"},
   tenantId:"tenant-1",
   session:{sessionId:"s1",userId:actorId,organizationId:"org-1",createdAt:0,expiresAt:Date.now()+60000,assurance:"standard" as const}
  }),
  syncClient:()=>({
   query:async(sql:string,values?:unknown[])=>{
    statements.push(sql);
    if(sql.includes("INSERT INTO outbox_events"))eventTypes.push(sql);
    if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:values?.[0]}],rowCount:1};
    if(sql.includes("SELECT id,status FROM tontine_groups"))return {rows:[{id:groupId,status:"active"}],rowCount:1};
    if(sql.includes("SELECT id FROM tontine_contributions"))return {rows:options.contributionExists===false?[]:[{id:contributionId}],rowCount:options.contributionExists===false?0:1};
    if(sql.includes("INSERT INTO tontine_cases"))return {rows:[{id:values?.[0],type:values?.[3],state:"opened",opened_by:values?.[4],payout_id:values?.[5],contribution_id:values?.[6],severity:values?.[7],summary:values?.[8]}],rowCount:1};
    return {rows:[],rowCount:1};
   },
   release:()=>{}
  }) as any
 });
 return {server,statements,eventTypes};
}
async function listen(server:any){await new Promise<void>(resolve=>server.listen(0,resolve));return (server.address() as any).port;}
async function close(server:any){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}

test("Community Tontine case intake is idempotency-keyed, audited and emitted atomically",async()=>{
 const {server,statements,eventTypes}=makeServer();
 const port=await listen(server);
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/cases`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-case-create-0001"},
   body:JSON.stringify({type:"dispute",severity:"high",summary:"Contestation d'une collecte terrain",contributionId})
  });
  const body=await response.json() as any;
  assert.equal(response.status,201,JSON.stringify(body));
  assert.equal(body.data.case.state,"opened");
  assert.equal(body.data.case.type,"dispute");
  assert.ok(statements.includes("BEGIN"));
  assert.ok(statements.some(sql=>sql.includes("FROM tontine_groups")&&sql.includes("FOR UPDATE")));
  assert.ok(statements.some(sql=>sql.includes("FROM tontine_contributions")&&sql.includes("FOR UPDATE")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO tontine_cases")));
  assert.ok(eventTypes.some(sql=>sql.includes("'tontine.case.opened'")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO api_request_audit")));
  assert.equal(statements.at(-1),"COMMIT");
 }finally{await close(server);}
});

test("Community Tontine case cannot reference a contribution from another group",async()=>{
 const {server,statements}=makeServer({contributionExists:false});
 const port=await listen(server);
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/cases`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-case-create-0002"},
   body:JSON.stringify({type:"dispute",severity:"medium",summary:"Référence à vérifier",contributionId})
  });
  assert.equal(response.status,404);
  assert.ok(statements.some(sql=>sql.includes("FROM tontine_contributions")&&sql.includes("organization_id=$1 AND group_id=$2")));
  assert.ok(!statements.some(sql=>sql.includes("INSERT INTO tontine_cases")));
  assert.equal(statements.at(-1),"ROLLBACK");
 }finally{await close(server);}
});

test("Community Tontine refund case requires an original financial reference",async()=>{
 const {server,statements}=makeServer();
 const port=await listen(server);
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/cases`,{
   method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"tontine-case-create-0003"},
   body:JSON.stringify({type:"refund",severity:"high",summary:"Demande de remboursement sans référence"})
  });
  assert.equal(response.status,400);
  assert.equal(statements.length,0);
 }finally{await close(server);}
});
