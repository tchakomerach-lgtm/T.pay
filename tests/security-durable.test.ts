import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryDurableSecurityStore, securityEventHash } from "../packages/security/src/durable-security.js";

const digest = "a".repeat(64);

test("replay barrier claims once and detects exact replays", async () => {
  const store = new InMemoryDurableSecurityStore();
  const input = { tenantId:"org-1", jti:"jti-1", requestDigest:digest, expiresAt:"2030-01-01T00:00:00.000Z", source:"user" as const };
  assert.equal(await store.claimReplay(input),"CLAIMED");
  assert.equal(await store.claimReplay(input),"REPLAY");
});

test("replay barrier hard-fails a reused JTI with a different digest", async () => {
  const store = new InMemoryDurableSecurityStore();
  const base = { tenantId:"org-1", jti:"jti-2", requestDigest:digest, expiresAt:"2030-01-01T00:00:00.000Z", source:"agent" as const };
  assert.equal(await store.claimReplay(base),"CLAIMED");
  assert.equal(await store.claimReplay({...base,requestDigest:"b".repeat(64)}),"DIGEST_CONFLICT");
});

test("approval is exact-digest, tenant-bound and one-time", async () => {
  const store = new InMemoryDurableSecurityStore();
  await store.createApproval({approvalId:"approval-1",tenantId:"org-1",approverId:"admin-1",requestDigest:digest,expiresAt:"2030-01-01T00:00:00.000Z"});
  assert.equal(await store.consumeApproval({approvalId:"approval-1",tenantId:"org-1",requestDigest:"b".repeat(64),now:"2029-01-01T00:00:00.000Z"}),"DIGEST_MISMATCH");
  assert.equal(await store.consumeApproval({approvalId:"approval-1",tenantId:"org-1",requestDigest:digest,now:"2029-01-01T00:00:00.000Z"}),"CONSUMED");
  assert.equal(await store.consumeApproval({approvalId:"approval-1",tenantId:"org-1",requestDigest:digest,now:"2029-01-01T00:00:00.000Z"}),"ALREADY_CONSUMED");
});

test("expired approval cannot be consumed", async () => {
  const store = new InMemoryDurableSecurityStore();
  await store.createApproval({approvalId:"approval-2",tenantId:"org-1",approverId:"admin-1",requestDigest:digest,expiresAt:"2029-01-01T00:00:00.000Z"});
  assert.equal(await store.consumeApproval({approvalId:"approval-2",tenantId:"org-1",requestDigest:digest,now:"2030-01-01T00:00:00.000Z"}),"EXPIRED");
});

test("security metadata rejects credential-like fields", async () => {
  const store = new InMemoryDurableSecurityStore();
  await assert.rejects(() => store.appendSecurityEvent({
    eventId:"event-1",tenantId:"org-1",requestId:"req-1",actorId:"user-1",occurredAt:"2029-01-01T00:00:00.000Z",
    decision:"DENY",reasonCode:"CAPABILITY_SCOPE",
    provenance:{policyVersion:"v1",policyRevision:"r1",requestDigest:digest,evaluatedAt:"2029-01-01T00:00:00.000Z",decisionSource:"runtime-policy",ruleIds:["R1"]},
    metadata:{token:"should-never-be-stored"}
  }));
});

test("security event hash changes when provenance changes", async () => {
  const base = {
    eventId:"event-2",tenantId:"org-1",requestId:"req-2",actorId:"user-1",occurredAt:"2029-01-01T00:00:00.000Z",
    decision:"DENY" as const,reasonCode:"CAPABILITY_SCOPE",
    provenance:{policyVersion:"v1",policyRevision:"r1",requestDigest:digest,evaluatedAt:"2029-01-01T00:00:00.000Z",decisionSource:"runtime-policy" as const,ruleIds:["R1"]},
    metadata:{surface:"api"}
  };
  const a = securityEventHash(base,null);
  const b = securityEventHash({...base,provenance:{...base.provenance,policyRevision:"r2"}},null);
  assert.notEqual(a,b);
  assert.match(a,/^[a-f0-9]{64}$/);
});
