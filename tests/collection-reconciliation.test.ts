import test from "node:test"; import assert from "node:assert/strict";
import {calculateExpectedCash,classifyCashReconciliation,assertNoAutomaticFinancialCorrection} from "../packages/microfinance/src/collection-reconciliation.js";
test("L9.2 calculates expected agent cash",()=>assert.equal(calculateExpectedCash(10000n,[
 {movementId:"1",sessionId:"s",direction:"in",amountMinor:5000n,currency:"XOF"},
 {movementId:"2",sessionId:"s",direction:"out",amountMinor:2000n,currency:"XOF"}]),13000n));
test("L9.2 classifies shortage/overage without ledger correction",()=>{
 assert.deepEqual(classifyCashReconciliation(13000n,12500n,true),{classification:"shortage",varianceMinor:-500n});
 assert.deepEqual(classifyCashReconciliation(13000n,13500n,true),{classification:"overage",varianceMinor:500n});
 assert.throws(()=>assertNoAutomaticFinancialCorrection("shortage"),/RECONCILIATION_EXCEPTION_REQUIRES_REVIEW/);
});
test("L9.2 rejects cash-out beyond expected float",()=>assert.throws(()=>calculateExpectedCash(500n,[{movementId:"1",sessionId:"s",direction:"out",amountMinor:501n,currency:"XOF"}]),/MFI_CASH_OUT_EXCEEDS_EXPECTED/));
