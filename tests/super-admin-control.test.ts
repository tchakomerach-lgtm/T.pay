import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeRootOperation,
  consumeGrant,
  createRecoveryRun,
  evaluateRecoveryGate,
  issueJitGrant,
  reopenFinancialOperations,
  requestDigest,
  transitionRecovery,
} from "../packages/security/src/super-admin-control.js";

test("request digest is deterministic and key-order independent", () => {
  assert.equal(requestDigest({ b: 2, a: 1 }), requestDigest({ a: 1, b: 2 }));
});

test("JIT grants are short-lived and one-shot grants expire after consumption", () => {
  const now = 1_000;
  const grant = issueJitGrant({
    principalId: "admin-1",
    resource: "prod/api",
    action: "security.read",
    justification: "incident verification",
    expiresAt: now + 5 * 60 * 1000,
    oneShot: true,
    approvalCount: 1,
    requiredApprovals: 1,
  }, now);
  const consumed = consumeGrant(grant, now + 1_000);
  assert.equal(consumed.expiresAt, now + 1_000);
});

test("root operations require independent quorum", () => {
  const digest = requestDigest({ action: "rotate-root-key", nonce: "1" });
  const operation = authorizeRootOperation({
    operation: "rotate-root-key",
    actorIds: ["a", "b", "c"],
    independentDomains: ["security", "finance", "infrastructure"],
    requestDigest: digest,
    expiresAt: 10_000,
  }, "AVAILABLE", 1_000);
  assert.equal(operation.actorIds.length, 3);
  assert.throws(() => authorizeRootOperation({
    operation: "rotate-root-key",
    actorIds: ["a", "a", "c"],
    independentDomains: ["security", "finance", "infrastructure"],
    requestDigest: digest,
    expiresAt: 10_000,
  }, "AVAILABLE", 1_000), /ROOT_ACTOR_DUPLICATE/);
});

test("financial reopening fails closed until every critical gate is verified", () => {
  const gate = {
    infrastructureTrusted: true,
    identityTrusted: true,
    keysTrusted: true,
    ledgerVerified: true,
    transactionsReconciled: false,
    securityValidated: true,
    quorumApproved: true,
  };
  assert.equal(evaluateRecoveryGate(gate), "RECOVERY_REQUIRED");
  assert.throws(() => reopenFinancialOperations(gate), /FINANCIAL_REOPEN_BLOCKED/);
  reopenFinancialOperations({ ...gate, transactionsReconciled: true });
});

test("recovery state machine does not allow skipping forensic/rebuild stages", () => {
  let run = createRecoveryRun("incident-1", { snapshot: "abc" }, 1_000);
  run = transitionRecovery(run, "COMPROMISED", 2_000);
  run = transitionRecovery(run, "ISOLATED", 3_000);
  assert.throws(() => transitionRecovery(run, "TRUSTED", 4_000), /RECOVERY_INVALID_TRANSITION/);
  run = transitionRecovery(run, "FORENSIC", 4_000);
  run = transitionRecovery(run, "REBUILDING", 5_000);
  run = transitionRecovery(run, "VERIFICATION", 6_000);
  run = transitionRecovery(run, "PARTIALLY_TRUSTED", 7_000);
  run = transitionRecovery(run, "TRUSTED", 8_000);
  assert.equal(run.state, "TRUSTED");
});
