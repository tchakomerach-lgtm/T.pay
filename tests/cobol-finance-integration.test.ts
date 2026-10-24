import test from "node:test";
import assert from "node:assert/strict";
import { calculateCommission } from "../packages/finance/src/commission.js";
import { money } from "../packages/finance/src/ledger.js";

test("compiled COBOL engine matches commission rules using integer minor units", () => {
  assert.equal(
    calculateCommission(money("XOF",10000n),{id:"rule",name:"10 percent",rateBps:1000,active:true}).minor,
    1000n
  );
  assert.equal(
    calculateCommission(money("XOF",10001n),{id:"rule",name:"quarter",rateBps:2500,active:true}).minor,
    2500n
  );
  assert.equal(
    calculateCommission(money("XOF",10000n),{id:"rule",name:"minimum",rateBps:1000,minMinor:1500n,active:true}).minor,
    1500n
  );
  assert.equal(
    calculateCommission(money("XOF",10000n),{id:"rule",name:"maximum",rateBps:1000,maxMinor:500n,active:true}).minor,
    500n
  );
});

test("compiled COBOL engine rejects values beyond its declared precision", () => {
  assert.throws(
    () => calculateCommission(money("XOF",1_000_000_000_000_000_000n),{id:"rule",name:"range",rateBps:1000,active:true}),
    /COBOL_FINANCE_AMOUNT_OUT_OF_RANGE/
  );
});
