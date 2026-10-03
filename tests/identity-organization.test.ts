import test from "node:test";
import assert from "node:assert/strict";
import { assertCredentialUsable } from "../packages/identity/src/credentials.js";
import { assertFreshChallenge } from "../packages/identity/src/passkey.js";
import { assertAuthorized } from "../packages/security/src/authorization.js";
import { createOrganization } from "../packages/organization/src/service.js";
import { assertKycVerified } from "../packages/microfinance/src/kyc.js";

test("revoked credentials cannot authenticate", () => {
  assert.throws(() => assertCredentialUsable({
    id: "c" as never, userId: "u" as never, kind: "passkey",
    status: "revoked", createdAt: new Date().toISOString(), failedAttempts: 0
  }), /CREDENTIAL_NOT_ACTIVE/);
});

test("expired passkey challenges are rejected", () => {
  assert.throws(() => assertFreshChallenge({
    challenge: "x", userId: "u" as never, expiresAt: 100, purpose: "authentication"
  }, 100), /PASSKEY_CHALLENGE_EXPIRED/);
});

test("cross-organization authorization is rejected", () => {
  assert.throws(() => assertAuthorized(
    { userId: "u", organizationId: "org-a", permissions: ["finance.read"], sessionId: "s" },
    { organizationId: "org-b", resourceOrganizationId: "org-b", requestedPermission: "finance.read" }
  ), /ORGANIZATION_CONTEXT_REQUIRED/);
});

test("organization access codes are never persisted in plaintext", async () => {
  let saved: any;
  const org = await createOrganization({
    founderId: "user-1" as never, name: "T.Pay Test", type: "company", accessCode: "very-secret-code"
  }, {
    repository: { insert: async x => { saved = x; }, findById: async () => saved },
    hasher: { hash: async value => `hash:${value}` },
    ids: { next: () => "org-1" as never },
    clock: { now: () => "2026-10-03T00:00:00.000Z" }
  });
  assert.equal(org.accessCodeHash, "hash:very-secret-code");
  assert.equal(saved.accessCode, undefined);
});

test("KYC must be verified before protected financial use", () => {
  assert.throws(() => assertKycVerified({
    id: "k", userId: "u", status: "pending", countryCode: "TG"
  }), /KYC_NOT_VERIFIED/);
});
