import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNITY_TONTINE_MF_GATES,
  evaluateCommunityTontineMfRelease,
  assertCommunityTontineMfRelease
} from "../packages/microfinance/src/community-tontine-mf-release-gates.js";

test("24-gate release evaluator fails closed when evidence is incomplete", () => {
  const result = evaluateCommunityTontineMfRelease([]);
  assert.equal(result.ready, false);
  assert.equal(result.passed, 0);
  assert.equal(result.missing.length, 24);
  assert.throws(() => assertCommunityTontineMfRelease([]), /COMMUNITY_TONTINE_MF_RELEASE_BLOCKED/);
});

test("24-gate release evaluator accepts only complete evidence for every gate", () => {
  const evidence = COMMUNITY_TONTINE_MF_GATES.map(gateId => ({
    gateId,
    code: true,
    tests: true,
    database: true,
    security: true,
    evidenceRefs: ["test:" + gateId]
  }));
  const result = evaluateCommunityTontineMfRelease(evidence);
  assert.equal(result.ready, true);
  assert.equal(result.passed, 24);
  assert.deepEqual(result.missing, []);
  assert.doesNotThrow(() => assertCommunityTontineMfRelease(evidence));
});
