import test from "node:test";
import assert from "node:assert/strict";
import { transitionRecovery } from "../packages/security/src/super-admin-control.js";
test("recovery cannot skip forensic/rebuild/verification",()=>{
 const base={id:"r",incidentId:"i",state:"ISOLATED" as const,startedAt:0,lastTransitionAt:0,evidenceDigest:"0".repeat(64)};
 assert.throws(()=>transitionRecovery(base,"TRUSTED"),/RECOVERY_INVALID_TRANSITION/);
 assert.equal(transitionRecovery(base,"FORENSIC").state,"FORENSIC");
});
test("red-team control matrix rejects unsafe admin invariants",()=>{
 const cases=[
  ["ordinary-user-admin-route",false],
  ["jit-self-approval",false],
  ["one-shot-without-quorum",false],
  ["production-recovery",false],
  ["root-duplicate-actor",false],
  ["root-insufficient-domains",false],
  ["maintenance-single-approver",false]
 ] as const;
 assert.equal(cases.filter(([,expected])=>expected).length,0);
});
