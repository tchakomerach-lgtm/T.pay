import test from "node:test";
import assert from "node:assert/strict";
import { CommunityTontineMfOperationsService } from "../packages/microfinance/src/community-tontine-mf-operations.js";
import { PostgresCommunityTontineMfReconciliationRepository } from "../packages/microfinance/src/community-tontine-mf-repositories.js";

const id = "11111111-1111-4111-8111-111111111111" as any;
const other = "22222222-2222-4222-8222-222222222222" as any;
const access = { id, organizationId:id, tontineGroupId:id, microfinanceId:id, role:"settlement_officer" as const, status:"active" as const, grantedBy:other, createdAt:"2026-10-05T00:00:00Z" };
const accessRepository = {
  getActive: async (org:string, group:string, mf:string, role:string) =>
    org === id && group === id && mf === id && role === "settlement_officer" ? access : null
};
const reconciliationRepository = { listOpen: async () => [], save: async () => undefined };
const settlementRepository = { savePrepared: async (_org:string, instruction:any) => instruction };

test("settlement preparation requires a persisted, scoped grant and durable storage", async () => {
  const service = new CommunityTontineMfOperationsService(accessRepository as any, reconciliationRepository as any, settlementRepository as any);
  const instruction = {
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:1000n, currency:"XOF", destinationRef:"mf:c1",
    requiresHumanApproval:true, state:"prepared" as const, createdAt:"2026-10-05T12:00:00Z"
  };
  const prepared = await service.prepareSettlement(access,id,instruction,other);
  assert.equal(prepared.state,"prepared");
  assert.equal(prepared.preparedBy,other);
  await assert.rejects(() => service.prepareSettlement(
    {...access, microfinanceId:other}, id, instruction, other
  ), /ACCESS_NOT_ACTIVE/);
  await assert.rejects(() => service.prepareSettlement(access,id,instruction,"" as any), /PREPARER_REQUIRED/);
});

test("reconciliation queue is capability protected by the persisted grant", async () => {
  const service = new CommunityTontineMfOperationsService(accessRepository as any, reconciliationRepository as any, settlementRepository as any);
  await assert.rejects(() => service.listReconciliation(access,id,id), /CAPABILITY_DENIED/);
  const noGrant = {...access, role:"reconciliation_officer" as const};
  await assert.rejects(() => service.listReconciliation(noGrant,id,id), /ACCESS_NOT_ACTIVE/);
});


test("reconciliation persistence query is scoped to organization, group, and partner", async () => {
  const calls: Array<{sql:string; values:unknown[]}> = [];
  const db = { query: async (sql:string, values:unknown[]) => { calls.push({sql,values}); return {rows:[]}; } } as any;
  const repository = new PostgresCommunityTontineMfReconciliationRepository(db);
  await repository.listOpen(id, other, id);
  assert.match(calls[0].sql,/organization_id=\$1 AND tontine_group_id=\$2 AND microfinance_id=\$3/);
  assert.deepEqual(calls[0].values,[id,other,id]);
});
