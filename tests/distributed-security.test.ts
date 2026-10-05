import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "pg";
import {PostgresReplayStore} from "../packages/security/src/distributed-replay-store.js";
import {PostgresCapabilityRevocationStore} from "../packages/ai/src/persistent-capability-revocation.js";
import {PostgresSecurityAuditStore} from "../packages/security/src/postgres-security-audit.js";

class FakeClient{
 readonly calls:Array<{sql:string;params:unknown[]}>=[];
 private replayed=false;
 private revoked=false;
 private globalEpoch=0;
 private lastHash:string|undefined;
 async query<T=unknown>(sql:string,params:unknown[]=[]):Promise<{rowCount:number;rows:T[]}>{
  this.calls.push({sql,params});
  if(sql.startsWith("INSERT INTO security_replay_claims")){
   if(this.replayed)return {rowCount:0,rows:[]};
   this.replayed=true;return {rowCount:1,rows:[]};
  }
  if(sql.startsWith("DELETE FROM security_replay_claims"))return {rowCount:1,rows:[]};
  if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK"||sql.startsWith("SELECT set_config")||sql.startsWith("SELECT pg_advisory_xact_lock"))return {rowCount:0,rows:[]};
  if(sql.includes("FROM security_audit_events")&&sql.includes("ORDER BY sequence_id DESC"))return {rowCount:this.lastHash?1:0,rows:this.lastHash?[{record_hash:this.lastHash} as T]:[]};
  if(sql.startsWith("INSERT INTO security_audit_events")){
   this.lastHash=String(params[10]);return {rowCount:1,rows:[]};
  }
  if(sql.startsWith("UPDATE ai_capability_revocation_state")){
   this.globalEpoch+=1;return {rowCount:1,rows:[{global_revocation_epoch:this.globalEpoch} as T]};
  }
  if(sql.includes("FROM ai_capability_revocation_state"))return {rowCount:1,rows:[{global_revocation_epoch:this.globalEpoch} as T]};
  if(sql.startsWith("INSERT INTO ai_capability_revocations")){this.revoked=true;return {rowCount:1,rows:[]};}
  if(sql.includes("FROM ai_capability_revocations"))return {rowCount:this.revoked?1:0,rows:[]};
  if(sql.includes("SELECT event_id,organization_id"))return {rowCount:0,rows:[]};
  throw new Error("UNEXPECTED_SQL");
 }
}

test("persistent replay store is atomic and duplicate-safe",async()=>{
 const client=new FakeClient();
 const store=new PostgresReplayStore(client as unknown as Client);
 const key={scope:"org:o",actionId:"a",payloadHash:"h",expiresAt:Date.now()+10000};
 assert.equal(await store.claim(key),true);
 assert.equal(await store.claim(key),false);
 assert.equal(await store.prune("o"),1);
});

test("persistent capability revocation propagates globally",async()=>{
 const client=new FakeClient();
 const store=new PostgresCapabilityRevocationStore(client as unknown as Client);
 assert.equal(await store.isRevoked("cap"),false);
 await store.revoke({capabilityId:"cap",revokedAt:Date.now(),reason:"incident"});
 assert.equal(await store.isRevoked("cap"),true);
 const epoch=await store.revokeAll("incident");
 assert.equal(epoch,1);
 assert.equal(await store.isGloballyRevoked(0),true);
 assert.equal(await store.isGloballyRevoked(1),false);
});

test("persistent audit chain self-anchors and serializes predecessor selection",async()=>{
 const client=new FakeClient();
 const store=new PostgresSecurityAuditStore(client as unknown as Client);
 const event={eventId:"e1",organizationId:"org",eventType:"security",severity:"high" as const,timestamp:Date.now(),payloadHash:"p1"};
 const hash=await store.append(event);
 assert.equal(hash.length,64);
 const next={...event,eventId:"e2",timestamp:event.timestamp+1,payloadHash:"p2"};
 const hash2=await store.append(next,hash);
 assert.equal(hash2.length,64);
 assert.throws(()=>store.append({...next,eventId:"e3",payloadHash:"p3"}, "wrong"),/SECURITY_AUDIT_PREVIOUS_HASH_MISMATCH/);
});

import {assertAuthorized} from "../packages/security/src/authorization-context.js";

test("ABAC denies cross-tenant resources and weak device/session context",()=>{
 const base={
  organizationId:"org",actorId:"actor",agentId:"agent",roles:["agent"],
  purpose:"transfer",dataClasses:["internal"],requestedAction:"transfer",
  resourceOrganizationId:"org",actorStatus:"active" as const,deviceTrust:"trusted" as const,
  sessionAgeMs:1000,policyVersion:"v1"
 };
 assert.doesNotThrow(()=>assertAuthorized(base,{action:"transfer",requiredRoles:["agent"],allowedDataClasses:["internal"],requiredPurpose:"transfer",requireActiveActor:true,requireTrustedDevice:true,maxSessionAgeMs:5000,policyVersion:"v1"}));
 assert.throws(()=>assertAuthorized({...base,resourceOrganizationId:"other"},{action:"transfer",requiredRoles:["agent"],allowedDataClasses:["internal"]}),/AUTHORIZATION_DENIED/);
 assert.throws(()=>assertAuthorized({...base,deviceTrust:"untrusted"},{action:"transfer",requiredRoles:["agent"],allowedDataClasses:["internal"],requireTrustedDevice:true}),/AUTHORIZATION_DENIED/);
 assert.throws(()=>assertAuthorized({...base,sessionAgeMs:6000},{action:"transfer",requiredRoles:["agent"],allowedDataClasses:["internal"],maxSessionAgeMs:5000}),/AUTHORIZATION_DENIED/);
});

import {generateKeyPairSync} from "node:crypto";
import {createSignedAgentMessage,verifySignedAgentMessage} from "../packages/security/src/signed-agent-message.js";
import {assertFinancialActionAuthorized,assertAiCannotSettleFinancialAction} from "../packages/security/src/financial-authority.js";

test("agent-to-agent messages require tenant-bound cryptographic signatures",()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const now=Date.now();
 const message=createSignedAgentMessage({messageId:"m1",sourceAgentId:"a",targetAgentId:"b",organizationId:"org",purpose:"handoff",nonce:"n1",issuedAt:now,expiresAt:now+10000,payload:"{}"},privateKey);
 assert.doesNotThrow(()=>verifySignedAgentMessage(message,publicKey,{organizationId:"org",targetAgentId:"b",now}));
 assert.throws(()=>verifySignedAgentMessage({...message,organizationId:"other"},publicKey,{organizationId:"org",targetAgentId:"b",now}),/AGENT_MESSAGE_TENANT_MISMATCH|AGENT_MESSAGE_SIGNATURE_INVALID/);
});

test("financial authority requires independent risk allow and approval quorum",()=>{
 const request={operation:"transfer" as const,organizationId:"org",actorId:"actor",transactionId:"tx",idempotencyKey:"idem",amountMinor:1000,currency:"XOF",beneficiaryId:"beneficiary",purpose:"payment",ledgerIntentHash:"hash",approvalCount:2,requiredApprovals:2,independentRiskDecision:"allow" as const};
 assert.doesNotThrow(()=>assertFinancialActionAuthorized(request));
 assert.throws(()=>assertFinancialActionAuthorized({...request,approvalCount:1}),/FINANCIAL_APPROVAL_QUORUM_REQUIRED/);
 assert.throws(()=>assertFinancialActionAuthorized({...request,independentRiskDecision:"review"}),/FINANCIAL_RISK_GATE_DENIED/);
 assert.throws(()=>assertAiCannotSettleFinancialAction("agent"),/AI_FINANCIAL_SETTLEMENT_FORBIDDEN/);
});
