import test from "node:test";
import assert from "node:assert/strict";
import { assertBalanced, money } from "../packages/finance/src/ledger.js";
import { assertPermission } from "../packages/security/src/policy.js";

test("ledger rejects unbalanced transactions",()=>assert.throws(()=>assertBalanced([
 {accountId:"a",amount:money("XOF",100n),direction:"debit"},
 {accountId:"b",amount:money("XOF",90n),direction:"credit"}
]),/LEDGER_UNBALANCED/));

test("ledger accepts balanced transactions",()=>assert.doesNotThrow(()=>assertBalanced([
 {accountId:"a",amount:money("XOF",100n),direction:"debit"},
 {accountId:"b",amount:money("XOF",100n),direction:"credit"}
])));

test("authorization rejects missing permission",()=>assert.throws(()=>assertPermission(
 {userId:"u",sessionId:"s",permissions:[]},"finance.approve"
),/FORBIDDEN/));