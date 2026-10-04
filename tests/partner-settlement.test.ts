import test from "node:test";
import assert from "node:assert/strict";
import {assertNoAutomaticLedgerCorrection,assertSettlementTransition,classifySettlementReconciliation,validateProviderConfirmation} from "../packages/microfinance/src/partner-settlement.js";

const settlement={settlementId:"s",organizationId:"org",partnerMfiId:"mfi",provider:"tmoney",direction:"collection" as const,amountMinor:5000n,currency:"XOF",clientReference:"TP-1",idempotencyKey:"idem",state:"submitted" as const};
const callback={callbackId:"cb",organizationId:"org",provider:"tmoney",providerEventId:"evt",settlementId:"s",rawBodyHash:"h",receivedAt:new Date().toISOString(),freshnessOk:true,signatureOk:true,payloadValid:true,amountMinor:5000n,currency:"XOF",clientReference:"TP-1",providerReference:"TM-9"};
test("accepts an authentic exact provider confirmation",()=>{const d=validateProviderConfirmation(settlement,callback);assert.deepEqual(d,{accepted:true,nextState:"provider_confirmed",reason:"PROVIDER_CONFIRMED"});});
test("quarantines amount mismatch before settlement",()=>{const d=validateProviderConfirmation(settlement,{...callback,amountMinor:5001n});assert.equal(d.nextState,"quarantined");assert.equal(d.reason,"AMOUNT_MISMATCH");});
test("quarantines cross-organization callback",()=>{const d=validateProviderConfirmation(settlement,{...callback,organizationId:"other"});assert.equal(d.nextState,"quarantined");});
test("rejects illegal state transition",()=>{assert.throws(()=>assertSettlementTransition("submitted","settled"),/INVALID_STATE_TRANSITION/);});
test("never auto-corrects a provider reconciliation mismatch",()=>{assert.throws(()=>assertNoAutomaticLedgerCorrection("amount_mismatch"),/REQUIRES_REVIEW/);});
test("classifies exact provider reconciliation as matched",()=>{assert.equal(classifySettlementReconciliation({...settlement,state:"provider_confirmed"},{amountMinor:5000n,currency:"XOF",clientReference:"TP-1",state:"settled"}),"matched");});
