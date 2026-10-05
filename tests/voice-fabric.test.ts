import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryAppointmentScheduler,
  assessCallerTrust,
  authorizeVoiceAction,
  createTransactionChallenge,
  createVoiceSession,
  mapVoiceIntentToRisk,
  transitionVoiceSession,
  verifyTransactionChallenge,
  type VoiceActionRequest,
  type VoicePolicy,
} from "../packages/ai/src/voice-fabric.js";

const policy: VoicePolicy = {
  minimumFactors: { V0: 0, V1: 0, V2: 0, V3: 1, V4: 2, V5: 2 },
  allowedFactors: {
    V0: [],
    V1: ["account_session"],
    V2: ["account_session", "push_confirmation"],
    V3: ["account_session", "passkey", "push_confirmation"],
    V4: ["passkey", "push_confirmation", "totp", "human_approval"],
    V5: ["signed_transaction", "human_approval", "passkey", "push_confirmation"],
  },
  humanApprovalRequiredFor: ["financial", "credit_decision", "privileged_admin"],
};

test("voice session uses a short-lived capability lease and valid transitions", () => {
  const now = new Date("2026-10-05T14:00:00.000Z");
  const session = createVoiceSession({ organizationId: "org-1", channel: "pstn", now, ttlMs: 60_000 });
  assert.equal(session.state, "RINGING");
  assert.equal(session.organizationId, "org-1");
  assert.notEqual(session.capabilityLeaseId, "");
  assert.equal(session.expiresAt, "2026-10-05T14:01:00.000Z");
  const accepted = transitionVoiceSession(session, "ACCEPTED");
  const consent = transitionVoiceSession(accepted, "CONSENT_CHECK");
  assert.equal(consent.state, "CONSENT_CHECK");
  assert.throws(() => transitionVoiceSession(consent, "EXECUTION"), /VOICE_INVALID_STATE_TRANSITION/);
});

test("caller id is never treated as identity proof", () => {
  const assessment = assessCallerTrust({
    callerIdPresent: true,
    claimedActorId: "user-1",
    accountActorId: "user-1",
  });
  assert.equal(assessment.callerIdTrusted, false);
  assert.ok(assessment.signals.includes("caller_id_matches_account"));
});

test("financial voice actions require non-voice step-up and approval", () => {
  const request: VoiceActionRequest = {
    id: "action-1",
    organizationId: "org-1",
    sessionId: "session-1",
    actorId: "user-1",
    kind: "financial",
    risk: mapVoiceIntentToRisk("financial"),
    toolName: "payment.create",
    target: "wallet-2",
    parameters: { amountMinor: 100000, currency: "XOF" },
  };
  const blocked = authorizeVoiceAction({ request, policy, verifiedFactors: ["account_session"] });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.requiredFactors.includes("signed_transaction"));
  assert.ok(blocked.requiredFactors.includes("human_approval"));
  const allowed = authorizeVoiceAction({
    request,
    policy,
    verifiedFactors: ["signed_transaction", "human_approval"],
  });
  assert.equal(allowed.allowed, true);
});

test("transaction challenge binds exact action and expires", () => {
  const now = new Date("2026-10-05T14:00:00.000Z");
  const action: VoiceActionRequest = {
    id: "action-2",
    organizationId: "org-1",
    sessionId: "session-1",
    kind: "financial",
    risk: "V5",
    toolName: "payment.create",
    target: "wallet-2",
    parameters: { amountMinor: 250000, currency: "XOF" },
  };
  const challenge = createTransactionChallenge({ sessionId: "session-1", action, now, ttlMs: 60_000 });
  assert.equal(verifyTransactionChallenge({ challenge, signedActionHash: challenge.actionHash, now }), true);
  assert.equal(
    verifyTransactionChallenge({
      challenge,
      signedActionHash: "tampered",
      now,
    }),
    false,
  );
  assert.equal(
    verifyTransactionChallenge({
      challenge,
      signedActionHash: challenge.actionHash,
      now: new Date("2026-10-05T14:02:00.000Z"),
    }),
    false,
  );
});

test("appointment booking prevents overlapping resource reservations", () => {
  const scheduler = new InMemoryAppointmentScheduler();
  const first = scheduler.book({
    organizationId: "school-1",
    resourceId: "director-office",
    actorId: "parent-1",
    startsAt: "2026-10-06T09:00:00.000Z",
    endsAt: "2026-10-06T10:00:00.000Z",
    channel: "pstn",
  });
  assert.equal(first.status, "confirmed");
  assert.throws(() => scheduler.book({
    organizationId: "school-1",
    resourceId: "director-office",
    actorId: "parent-2",
    startsAt: "2026-10-06T09:30:00.000Z",
    endsAt: "2026-10-06T10:30:00.000Z",
    channel: "pstn",
  }), /VOICE_APPOINTMENT_CONFLICT/);
  const cancelled = scheduler.cancel("school-1", first.id);
  assert.equal(cancelled.status, "cancelled");
  assert.doesNotThrow(() => scheduler.book({
    organizationId: "school-1",
    resourceId: "director-office",
    actorId: "parent-2",
    startsAt: "2026-10-06T09:30:00.000Z",
    endsAt: "2026-10-06T10:30:00.000Z",
    channel: "pstn",
  }));
});

test("appointment tenant isolation is enforced", () => {
  const scheduler = new InMemoryAppointmentScheduler();
  const appointment = scheduler.book({
    organizationId: "org-a",
    resourceId: "room-1",
    startsAt: "2026-10-06T09:00:00.000Z",
    endsAt: "2026-10-06T10:00:00.000Z",
    channel: "mobile",
  });
  assert.throws(() => scheduler.cancel("org-b", appointment.id), /VOICE_APPOINTMENT_NOT_FOUND/);
});
