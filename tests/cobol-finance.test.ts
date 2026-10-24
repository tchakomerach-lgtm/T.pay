import test from "node:test";
import assert from "node:assert/strict";
import { calculateCommissionWithCobol } from "../packages/finance/src/cobol-commission.js";
import { calculateCommission } from "../packages/finance/src/commission.js";
import { money } from "../packages/finance/src/ledger.js";

test("COBOL adapter rejects unsupported precision before process invocation", () => {
  assert.throws(
    () => calculateCommissionWithCobol({baseMinor:1_000_000_000_000_000_000n,rateBps:100}),
    /COBOL_FINANCE_AMOUNT_OUT_OF_RANGE/
  );
});

test("COBOL adapter rejects invalid commission rates and bounds", () => {
  assert.throws(() => calculateCommissionWithCobol({baseMinor:1000n,rateBps:10001}), /INVALID_COMMISSION_RATE/);
  assert.throws(() => calculateCommissionWithCobol({baseMinor:1000n,rateBps:100,minMinor:500n,maxMinor:100n}), /INVALID_COMMISSION_BOUNDS/);
});

test("COBOL mode fails closed when its executable is not configured", () => {
  const previousEngine=process.env.TPAY_FINANCE_ENGINE;
  const previousBinary=process.env.TPAY_COBOL_FINANCE_BIN;
  try {
    process.env.TPAY_FINANCE_ENGINE="cobol";
    delete process.env.TPAY_COBOL_FINANCE_BIN;
    assert.throws(
      () => calculateCommission(money("XOF",10000n),{id:"rule",name:"test",rateBps:1000,active:true}),
      /COBOL_FINANCE_BINARY_NOT_CONFIGURED/
    );
  } finally {
    if(previousEngine===undefined) delete process.env.TPAY_FINANCE_ENGINE;
    else process.env.TPAY_FINANCE_ENGINE=previousEngine;
    if(previousBinary===undefined) delete process.env.TPAY_COBOL_FINANCE_BIN;
    else process.env.TPAY_COBOL_FINANCE_BIN=previousBinary;
  }
});

test("TypeScript finance engine preserves the existing integer commission contract", () => {
  const previousEngine=process.env.TPAY_FINANCE_ENGINE;
  try {
    delete process.env.TPAY_FINANCE_ENGINE;
    const result=calculateCommission(money("XOF",10001n),{id:"rule",name:"test",rateBps:2500,active:true});
    assert.equal(result.minor,2500n);
    assert.equal(result.currency,"XOF");
  } finally {
    if(previousEngine===undefined) delete process.env.TPAY_FINANCE_ENGINE;
    else process.env.TPAY_FINANCE_ENGINE=previousEngine;
  }
});
