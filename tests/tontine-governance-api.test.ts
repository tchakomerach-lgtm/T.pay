import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";
import { resolveRoutePolicy } from "../packages/api-gateway/src/policy.js";

const groupId="123e4567-e89b-42d3-a456-426614174000";
const actorId="123e4567-e89b-42d3-a456-426614174002";
const proposalId="123e4567-e89b-42d3-a456-426614174004";
const policyRow={organization_id:"org-1",group_id:groupId,policy_version:1,quorum_percent:50,approval_percent:66,allow_abstention:false};

function serverFor(handler:(sql:string,values:unknown[]|undefined)=>{rows:Record<string,unknown>[];rowCount:number|null}){
 const statements:string[]=[];
 const server=createSchoolApiServer({
  db:{query:async()=>({rows:[],rowCount:0})} as any,
  authenticate:async()=>({
   principal:{userId:actorId,organizationId:"org-1",permissions:["org.read","org.manage"] as const,sessionId:"s1"},
   tenantId:"tenant-1",
   session:{sessionId:"s1",userId:actorId,organizationId:"org-1",createdAt:0,expiresAt:Date.now()+60000,assurance:"standard" as const}
  }),
  syncClient:()=>({
   query:async(sql:string,values?:unknown[])=>{statements.push(sql);return handler(sql,values);},
   release:()=>{}
  }) as any
 });
 return {server,statements};
}
async function listen(server:any){await new Promise<void>(resolve=>server.listen(0,resolve));return (server.address() as any).port;}
async function close(server:any){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}

test("Community Tontine governance endpoints are explicitly allowlisted",()=>{
 assert.equal(resolveRoutePolicy("PUT",`/v1/tontine/groups/${groupId}/governance/policy`)?.financial,false);
 assert.equal(resolveRoutePolicy("POST",`/v1/tontine/groups/${groupId}/governance/proposals`)?.financial,false);
 assert.equal(resolveRoutePolicy("POST",`/v1/tontine/groups/${groupId}/governance/proposals/${proposalId}/votes`)?.financial,false);
 assert.equal(resolveRoutePolicy("POST",`/v1/tontine/groups/${groupId}/governance/proposals/${proposalId}`)?.financial,false);
});

test("governance policy writes are versioned, idempotent, audited and outboxed in one transaction",async()=>{
 const {server,statements}=serverFor(sql=>{
  if(sql.includes("SELECT id,governance,status FROM tontine_groups"))return {rows:[{id:groupId,governance:"member_vote",status:"active"}],rowCount:1};
  if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:"123e4567-e89b-42d3-a456-426614174005"}],rowCount:1};
  if(sql.includes("SELECT policy_version FROM tontine_governance_group_policies"))return {rows:[],rowCount:0};
  if(sql.includes("INSERT INTO tontine_governance_group_policies"))return {rows:[policyRow],rowCount:1};
  return {rows:[],rowCount:1};
 });
 const port=await listen(server);
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/governance/policy`,{method:"PUT",headers:{"content-type":"application/json","x-idempotency-key":"governance-policy-0001"},body:JSON.stringify({quorumPercent:50,approvalPercent:66,allowAbstention:false})});
  const body=await response.json() as any;
  assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.data.policy.policy_version,1);
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO tontine_governance_group_policies")));
  assert.ok(statements.some(sql=>sql.includes("tontine.governance.policy.updated")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO api_request_audit")));
  assert.equal(statements.at(-1),"COMMIT");
 }finally{await close(server);}
});

test("proposal opening snapshots policy and active-member count atomically",async()=>{
 const {server,statements}=serverFor(sql=>{
  if(sql.includes("SELECT id,governance,status FROM tontine_groups"))return {rows:[{id:groupId,governance:"member_vote",status:"active"}],rowCount:1};
  if(sql.includes("SELECT id FROM tontine_memberships"))return {rows:[{id:"membership-1"}],rowCount:1};
  if(sql.includes("SELECT policy_version,quorum_percent,approval_percent,allow_abstention"))return {rows:[policyRow],rowCount:1};
  if(sql.includes("SELECT count(*)::integer AS count FROM tontine_memberships"))return {rows:[{count:4}],rowCount:1};
  if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:proposalId}],rowCount:1};
  if(sql.includes("INSERT INTO tontine_governance_proposals"))return {rows:[{id:proposalId,type:"rule_change",status:"open",quorum_percent_snapshot:50,approval_percent_snapshot:66,eligible_member_count_snapshot:4,policy_version_snapshot:1}],rowCount:1};
  return {rows:[],rowCount:1};
 });
 const port=await listen(server);
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/governance/proposals`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"governance-proposal-0001"},body:JSON.stringify({type:"rule_change",payload:{reason:"Update cycle rule"},closesAt:new Date(Date.now()+48*60*60*1000).toISOString()})});
  const body=await response.json() as any;
  assert.equal(response.status,201,JSON.stringify(body));
  assert.equal(body.data.proposal.eligible_member_count_snapshot,4);
  assert.ok(statements.some(sql=>sql.includes("FOR SHARE")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO tontine_governance_proposals")));
  assert.ok(statements.some(sql=>sql.includes("tontine.governance.proposal.opened")));
  assert.equal(statements.at(-1),"COMMIT");
 }finally{await close(server);}
});

test("governance votes require an active member and are persisted with audit and outbox",async()=>{
 const {server,statements}=serverFor((sql,values)=>{
  if(sql.includes("SELECT id,governance,status FROM tontine_groups"))return {rows:[{id:groupId,governance:"member_vote",status:"active"}],rowCount:1};
  if(sql.includes("INSERT INTO api_request_deduplication"))return {rows:[{id:"123e4567-e89b-42d3-a456-426614174006"}],rowCount:1};
  if(sql.includes("SELECT id,status,closes_at,allow_abstention_snapshot"))return {rows:[{id:proposalId,status:"open",closes_at:new Date(Date.now()+24*60*60*1000).toISOString(),allow_abstention_snapshot:false}],rowCount:1};
  if(sql.includes("SELECT id FROM tontine_memberships"))return {rows:[{id:"membership-1"}],rowCount:1};
  if(sql.includes("INSERT INTO tontine_governance_votes"))return {rows:[{id:values?.[0],proposal_id:proposalId,voter_id:actorId,choice:"approve",cast_at:new Date().toISOString()}],rowCount:1};
  return {rows:[],rowCount:1};
 });
 const port=await listen(server);
 try{
  const response=await fetch(`http://127.0.0.1:${port}/v1/tontine/groups/${groupId}/governance/proposals/${proposalId}/votes`,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"governance-vote-0001"},body:JSON.stringify({choice:"approve"})});
  const body=await response.json() as any;
  assert.equal(response.status,201,JSON.stringify(body));
  assert.equal(body.data.vote.choice,"approve");
  assert.ok(statements.some(sql=>sql.includes("FROM tontine_governance_proposals")&&sql.includes("FOR UPDATE")));
  assert.ok(statements.some(sql=>sql.includes("INSERT INTO tontine_governance_votes")));
  assert.ok(statements.some(sql=>sql.includes("tontine.governance.vote.cast")));
  assert.equal(statements.at(-1),"COMMIT");
 }finally{await close(server);}
});
