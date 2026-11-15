import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCommunityTontineAdmissionRepository } from "../packages/microfinance/src/community-tontine-admission-repository.js";
import type { UUID } from "../packages/domain/src/types.js";

const id = "11111111-1111-4111-8111-111111111111" as UUID;
const hash = "a".repeat(64);

test("admission decision and immutable audit are committed in one transaction", async () => {
  const calls: Array<{sql:string;values:readonly unknown[]}> = [];
  const tx = { query: async (sql:string, values:readonly unknown[] = []) => {
    calls.push({sql,values});
    return { rows: sql.includes("RETURNING state") ? [{state:"APPROVED"}] : [], rowCount: sql.includes("RETURNING state") ? 1 : 1 };
  }, transaction: async (work:(tx:any)=>Promise<unknown>) => work(tx) } as any;
  const repo = new PostgresCommunityTontineAdmissionRepository(tx);
  await repo.decideMembership({organizationId:id,groupId:id,candidateId:id,expectedState:"VERIFYING",
    nextState:"APPROVED",decision:"ACCEPT",actorRole:"COMMUNITY_ADMIN",actorId:id,reason:"Identity evidence verified",decidedAt:"2026-11-15T10:00:00Z"});
  assert.equal(calls.length,2);
  assert.match(calls[0]!.sql,/organization_id=\$1 AND group_id=\$2 AND id=\$3 AND state=\$4/);
  assert.match(calls[1]!.sql,/INSERT INTO community_tontine_admission_audit/);
  assert.equal(calls[1]!.values[5],"VERIFYING");
  assert.equal(calls[1]!.values[6],"APPROVED");
});

test("admission compare-and-set conflict aborts before audit insert", async () => {
  let auditInserted = false;
  const tx = { query: async (sql:string) => {
    if (sql.includes("RETURNING state")) return {rows:[],rowCount:0};
    if (sql.includes("admission_audit")) auditInserted = true;
    return {rows:[],rowCount:1};
  }, transaction: async (work:(tx:any)=>Promise<unknown>) => work(tx) } as any;
  const repo = new PostgresCommunityTontineAdmissionRepository(tx);
  await assert.rejects(() => repo.decideMembership({organizationId:id,groupId:id,candidateId:id,
    expectedState:"VERIFYING",nextState:"APPROVED",decision:"ACCEPT",actorRole:"COMMUNITY_ADMIN",actorId:id,
    reason:"verified",decidedAt:"2026-11-15T10:00:00Z"}),/STATE_CONFLICT/);
  assert.equal(auditInserted,false);
});

test("final participation consent requires exact accepted financial and rotation terms", async () => {
  const repo = new PostgresCommunityTontineAdmissionRepository({query:async()=>({rows:[],rowCount:1})} as any);
  const consent = {id,candidateId:id,groupId:id,partnerId:id,purpose:"FINAL_PARTICIPATION" as const,
    termsVersion:"v1",grantedAt:"2026-11-15T10:00:00Z",expiresAt:"2026-12-15T10:00:00Z"};
  await assert.rejects(() => repo.recordConsent(id,consent),/FINAL_CONSENT_TERMS_REQUIRED/);
  const calls: Array<{sql:string;values:readonly unknown[]}> = [];
  const validRepo = new PostgresCommunityTontineAdmissionRepository({query:async(sql:string,values:readonly unknown[])=>{
    calls.push({sql,values});return {rows:[],rowCount:1};
  }} as any);
  await validRepo.recordConsent(id,{...consent,contributionAmountMinor:2500n,currency:"XOF",
    cadence:"DAILY",rotationOrderHash:hash});
  assert.match(calls[0]!.sql,/community_tontine_consents/);
  assert.equal(calls[0]!.values[10],"2500");
  assert.equal(calls[0]!.values[13],hash);
});

test("launch activation is compare-and-set and scoped by tenant, group, snapshot and idempotency key", async () => {
  let queryText = "";
  let values: readonly unknown[] = [];
  const repo = new PostgresCommunityTontineAdmissionRepository({query:async(sql:string,v:readonly unknown[])=>{
    queryText=sql;values=v;return {rows:[{id}],rowCount:1};
  }} as any);
  await repo.activateLaunch({organizationId:id,groupId:id,snapshotId:id,configHash:hash,
    idempotencyKey:"launch-1",actorId:id,activatedAt:"2026-11-15T10:00:00Z"});
  assert.match(queryText,/organization_id=\$1 AND group_id=\$2 AND id=\$3/);
  assert.match(queryText,/idempotency_key=\$5 AND state='ARMED'/);
  assert.equal(values.length,7);
  assert.equal(values[5],id);
});

test("microfinance partner cannot make community admission decisions", async () => {
  let writes = 0;
  const tx = {query:async()=>{writes++;return {rows:[{state:"APPROVED"}],rowCount:1};},
    transaction:async(work:(tx:any)=>Promise<unknown>)=>work(tx)} as any;
  const repo = new PostgresCommunityTontineAdmissionRepository(tx);
  await assert.rejects(() => repo.decideMembership({organizationId:id,groupId:id,candidateId:id,
    expectedState:"VERIFYING",nextState:"APPROVED",decision:"ACCEPT",actorRole:"MICROFINANCE_AGENT",
    actorId:id,reason:"Partner verification only",decidedAt:"2026-11-15T10:00:00Z"}),/COMMUNITY_ADMIN_DECISION_REQUIRED/);
  assert.equal(writes,0);
});
