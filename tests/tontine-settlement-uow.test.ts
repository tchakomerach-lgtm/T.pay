import test from "node:test";
import assert from "node:assert/strict";
import type { UUID } from "../packages/domain/src/types.js";
import {
  executeDurableTontineSettlement,
  type DurableSettlementTx,
  type DurableTontineSettlementRepository
} from "../packages/microfinance/src/tontine-settlement-uow.js";
import type { TontineContribution } from "../packages/microfinance/src/community-tontine.js";
import type { TontinePaymentIntent, TontineProviderEvent, TontineReceipt } from "../packages/microfinance/src/tontine-settlement.js";

const org="org-1" as UUID;
const contribution: TontineContribution={
  id:"contrib-1" as UUID,groupId:"group-1" as UUID,membershipId:"member-1" as UUID,
  scheduledFor:"2026-10-03",amountMinor:1000n,currency:"XOF",status:"pending",
  channel:"mobile_money",idempotencyKey:"idem-1234567890123456"
};
const payment:TontinePaymentIntent={
  id:"payment-1" as UUID,organizationId:org,contributionId:contribution.id,
  idempotencyKey:contribution.idempotencyKey,amountMinor:1000n,currency:"XOF",
  provider:"tmoney",providerReference:"tm-1",status:"provider_confirmed",
  createdAt:"2026-10-03T12:00:00Z",updatedAt:"2026-10-03T12:00:00Z"
};
const provider:TontineProviderEvent={
  provider:"tmoney",eventId:"evt-1",paymentId:payment.id,providerReference:"tm-1",
  amountMinor:1000n,currency:"XOF",status:"accepted",occurredAt:"2026-10-03T12:00:00Z"
};
const baseInput=()=>({
  organizationId:org,paymentIntent:payment,contribution,providerEvent:provider,
  feeSnapshot:{contributionId:contribution.id,microfinanceFeeMinor:10n,tpayFeeMinor:50n,totalFeeMinor:60n,currency:"XOF",ruleVersion:"v1",calculatedAt:"2026-10-03T12:00:00Z"},
  ledgerTransaction:{id:"ledger-1",organizationId:org,idempotencyKey:contribution.idempotencyKey,occurredAt:"2026-10-03T12:00:00Z",lines:[
    {accountId:"cash",amount:{currency:"XOF",minor:1000n},direction:"debit" as const},
    {accountId:"tontine",amount:{currency:"XOF",minor:1000n},direction:"credit" as const}
  ],postedAt:"2026-10-03T12:00:00Z"},
  receipt:{receiptId:"receipt-1" as UUID,contributionId:contribution.id,paymentIntentId:payment.id,providerReference:"tm-1",amountMinor:1000n,currency:"XOF",issuedAt:"2026-10-03T12:00:00Z",ledgerTransactionId:"ledger-1"} as TontineReceipt,
  outboxEvent:{id:"outbox-1",eventType:"tontine.contribution_settled",payload:"{}"},
  now:"2026-10-03T12:00:00Z"
});

function repository(options?:{existingLedger?:boolean;claim?:boolean;failAt?:string}){
  const state:{ledger:boolean;claimed:boolean;actions:string[]}={ledger:options?.existingLedger??false,claimed:false,actions:[]};
  const tx:DurableSettlementTx={
    providerEvents:{async claim(){state.actions.push("claim");if(options?.claim===false)return false;state.claimed=true;return true;}},
    ledger:{async findByIdempotencyKey(){state.actions.push("ledger.find");return state.ledger?{id:"ledger-1"}:undefined;},async append(){state.actions.push("ledger.append");if(options?.failAt==="ledger")throw new Error("DB_FAIL");state.ledger=true;}},
    contributions:{async getForUpdate(){state.actions.push("contribution.lock");return contribution;},async confirm(){state.actions.push("contribution.confirm");}},
    payments:{async getForUpdate(){state.actions.push("payment.lock");return payment;},async markSettled(){state.actions.push("payment.settled");}},
    fees:{async insertImmutable(){state.actions.push("fee.insert");}},
    receipts:{async insert(){state.actions.push("receipt.insert");}},
    outbox:{async enqueue(){state.actions.push("outbox.enqueue");}}
  };
  const repo: DurableTontineSettlementRepository = {
    async runAtomic(_input, operation) {
      state.actions.push("tx.begin");
      try {
        return await operation({
          organizationId: org,
          transactionId: "tx-1",
          isolation: "serializable",
          ...tx
        });
      } catch (e) {
        state.actions.push("tx.rollback");
        throw e;
      } finally {
        state.actions.push("tx.end");
      }
    }
  };
  return {repo,state};
}

test("settlement commits all financial/evidence steps in one atomic boundary",async()=>{
  const {repo,state}=repository();
  const result=await executeDurableTontineSettlement(baseInput(),repo);
  assert.equal(result.replay,false);
  assert.deepEqual(state.actions,["tx.begin","payment.lock","contribution.lock","ledger.find","claim","ledger.append","fee.insert","contribution.confirm","payment.settled","receipt.insert","outbox.enqueue","tx.end"]);
});

test("ledger idempotency wins before a duplicate provider callback can post",async()=>{
  const {repo,state}=repository({existingLedger:true});
  const result=await executeDurableTontineSettlement(baseInput(),repo);
  assert.equal(result.replay,true);
  assert.deepEqual(state.actions,["tx.begin","payment.lock","contribution.lock","ledger.find","tx.end"]);
});

test("provider event claim collision cannot silently create a second settlement",async()=>{
  const {repo,state}=repository({claim:false});
  await assert.rejects(()=>executeDurableTontineSettlement(baseInput(),repo),/SETTLEMENT_PROVIDER_EVENT_IN_PROGRESS/);
  assert.equal(state.actions.includes("ledger.append"),false);
});

test("ledger failure prevents downstream confirmation, receipt and outbox",async()=>{
  const {repo,state}=repository({failAt:"ledger"});
  await assert.rejects(()=>executeDurableTontineSettlement(baseInput(),repo),/DB_FAIL/);
  assert.equal(state.actions.includes("contribution.confirm"),false);
  assert.equal(state.actions.includes("receipt.insert"),false);
  assert.equal(state.actions.includes("outbox.enqueue"),false);
});

test("organization mismatch is rejected before opening a financial transaction",async()=>{
  let opened=false;
  const repo={runAtomic:async()=>{opened=true;throw new Error("MUST_NOT_RUN");}} as any;
  await assert.rejects(()=>executeDurableTontineSettlement({...baseInput(),organizationId:"other" as UUID},repo),/SETTLEMENT_ORGANIZATION_MISMATCH/);
  assert.equal(opened,false);
});
