import test from "node:test";
import assert from "node:assert/strict";
import { createStepUpChallenge, consumeChallenge } from "../packages/security/src/webauthn-stepup.js";
import { requestDigest } from "../packages/security/src/super-admin-control.js";
test("WebAuthn step-up challenge is short-lived, context-bound and one-shot",()=>{
 const c=createStepUpChallenge({userId:"u1",rpId:"admin.tpay.tg",origin:"https://admin.tpay.tg"});
 const used=consumeChallenge(c,{userId:"u1",rpId:"admin.tpay.tg",origin:"https://admin.tpay.tg"});
 assert.ok(used.usedAt);
 assert.throws(()=>consumeChallenge(used,{userId:"u1",rpId:"admin.tpay.tg",origin:"https://admin.tpay.tg"}),/WEBAUTHN_CHALLENGE_EXPIRED/);
 assert.throws(()=>consumeChallenge(c,{userId:"u2",rpId:"admin.tpay.tg",origin:"https://admin.tpay.tg"}),/WEBAUTHN_CHALLENGE_CONTEXT_INVALID/);
});
test("request digest is deterministic for root anti-replay binding",()=>{
 const a=requestDigest({nonce:"n1",operation:"freeze",scope:"root"});
 const b=requestDigest({scope:"root",operation:"freeze",nonce:"n1"});
 assert.equal(a,b); assert.equal(a.length,64);
});
