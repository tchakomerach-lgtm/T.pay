import test from "node:test";
import assert from "node:assert/strict";
import { CommunityTontineMfOperationsService } from "../packages/microfinance/src/community-tontine-mf-operations.js";

const id = "11111111-1111-4111-8111-111111111111" as any;
const access = { id, organizationId:id, tontineGroupId:id, microfinanceId:id, role:"settlement_officer" as const, status:"active" as const, grantedBy:id, createdAt:"2026-10-05T00:00:00Z" };
const repos = {
  accessRepository: {} as any,
  reconciliationRepository: { listOpen: async () => [], save: async () => undefined }
};

test("settlement preparation is scoped to the partner microfinance and tontine", async () => {
  const service = new CommunityTontineMfOperationsService(repos.accessRepository, repos.reconciliationRepository);
  const instruction = {
    id, tontineGroupId:id, microfinanceId:id, payoutId:id, beneficiaryClientId:id,
    amountMinor:1000n, currency:"XOF", destinationRef:"mf:c1",
    requiresHumanApproval:true, state:"prepared" as const, createdAt:"2026-10-05T12:00:00Z"
  };
  assert.equal((await service.prepareSettlement(access,id,instruction)).state,"prepared");
  assert.throws(() => service.prepareSettlement(
    {...access, microfinanceId:"22222222-2222-4222-8222-222222222222" as any},
    id,instruction
  ), /PARTNER_SCOPE_DENIED/);
});

test("reconciliation queue is capability protected", async () => {
  const service = new CommunityTontineMfOperationsService(repos.accessRepository, repos.reconciliationRepository);
  assert.deepEqual(await service.listReconciliation({...access, role:"reconciliation_officer"},id,id),[]);
  await assert.rejects(async()=>service.listReconciliation(access,id,id),/CAPABILITY_DENIED/);
});
