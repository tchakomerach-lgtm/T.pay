import test from "node:test";
import assert from "node:assert/strict";
import { PostgresCommunityTontineMfSettlementRepository } from "../packages/microfinance/src/community-tontine-mf-settlement-repository.js";

const id = "11111111-1111-4111-8111-111111111111" as any;

test("settlement approval is a compare-and-set transition scoped to organization and prepared state", async () => {
  const calls: Array<{sql:string; values:unknown[]}> = [];
  const db = {
    query: async (sql:string, values:unknown[]) => {
      calls.push({sql,values});
      return { rows: [{ id, tontine_group_id:id, microfinance_id:id, payout_id:id, beneficiary_client_id:id,
        amount_minor:"1000", currency:"XOF", destination_ref:"mf:destination", requires_human_approval:true,
        prepared_by:"22222222-2222-4222-8222-222222222222", approved_by:id, state:"approved",
        created_at:"2026-10-09T00:00:00Z" }] };
    }
  } as any;
  const repository = new PostgresCommunityTontineMfSettlementRepository(db);
  const approved = await repository.markApproved(id,id,id,"prepared");
  assert.equal(approved.state,"approved");
  assert.match(calls[0].sql,/organization_id=\$1 AND id=\$2 AND state=\$4/);
  assert.match(calls[0].sql,/prepared_by IS NOT NULL AND prepared_by <> \$3/);
  assert.match(calls[0].sql,/pi\.state='approved'/);
  assert.match(calls[0].sql,/beneficiary\.client_id=community_tontine_mf_settlement_instructions\.beneficiary_client_id/);
  assert.deepEqual(calls[0].values,[id,id,id,"prepared"]);
});

test("settlement approval fails closed when a concurrent worker changed the state", async () => {
  const db = { query: async () => ({ rows: [] }) } as any;
  const repository = new PostgresCommunityTontineMfSettlementRepository(db);
  await assert.rejects(() => repository.markApproved(id,id,id,"prepared"), /APPROVAL_CONFLICT/);
});

test("preparation cannot overwrite an already approved instruction", async () => {
  const calls: Array<{sql:string; values:unknown[]}> = [];
  const db = {
    query: async (sql:string,values:unknown[]) => { calls.push({sql,values}); return {rows:[]}; },
    transaction: async (work:(tx:any)=>Promise<unknown>) => work(db)
  } as any;
  const repository = new PostgresCommunityTontineMfSettlementRepository(db);
  const instruction = { id,tontineGroupId:id,microfinanceId:id,payoutId:id,beneficiaryClientId:id,amountMinor:1000n,
    currency:"XOF",destinationRef:"mf:destination",requiresHumanApproval:true,preparedBy:id,state:"prepared" as const,createdAt:"2026-10-09T00:00:00Z" };
  await assert.rejects(() => repository.savePrepared(id,instruction), /PERSISTENCE_CONFLICT/);
  assert.match(calls[0].sql,/ON CONFLICT DO NOTHING/);
  assert.match(calls[0].sql,/FROM payout_intents pi/);
  assert.match(calls[0].sql,/pi\.state='approved'/);
  assert.match(calls[1].sql,/state='prepared'/);
  assert.match(calls[1].sql,/beneficiary_client_id=\$6/);
  assert.match(calls[1].sql,/destination_ref=\$9/);
});


test("identical prepared settlement replay returns the durable row without rewriting it", async () => {
  const calls: string[] = [];
  const instruction = { id,tontineGroupId:id,microfinanceId:id,payoutId:id,beneficiaryClientId:id,amountMinor:1000n,
    currency:"XOF",destinationRef:"mf:destination",requiresHumanApproval:true,preparedBy:id,state:"prepared" as const,createdAt:"2026-10-09T00:00:00Z" };
  const existing = { id,tontine_group_id:id,microfinance_id:id,payout_id:id,beneficiary_client_id:id,
    amount_minor:"1000",currency:"XOF",destination_ref:"mf:destination",requires_human_approval:true,
    prepared_by:id,approved_by:null,state:"prepared",version:1,created_at:"2026-10-09T00:00:00Z" };
  const db = {
    transaction: async (work:(tx:any)=>Promise<unknown>) => work({
      query: async (sql:string) => {
        calls.push(sql);
        return calls.length === 1 ? {rows:[]} : {rows:[existing]};
      }
    })
  } as any;
  const repository = new PostgresCommunityTontineMfSettlementRepository(db);
  const replayed = await repository.savePrepared(id,instruction);
  assert.equal(replayed.state,"prepared");
  assert.equal(replayed.amountMinor,1000n);
  assert.equal(calls.length,2);
  assert.match(calls[1],/FOR UPDATE/);
});
