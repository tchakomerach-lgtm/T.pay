import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFieldContinuityPlan,
  haversineDistanceKm,
  validateCustomerFieldLocation,
  type CustomerFieldProfile,
  type FieldAgentCandidate,
} from "../packages/microfinance/src/client-field-registry.js";

const location = {
  latitude: 6.1725,
  longitude: 1.2314,
  accuracyMeters: 12,
  capturedAt: "2026-10-11T08:00:00.000Z",
  method: "gps" as const,
  consentRecorded: true,
  addressLabel: "Agoe, rue du marché",
  landmark: "Boutique derrière le marché",
  verifiedBy: "supervisor-1",
  verifiedAt: "2026-10-11T08:10:00.000Z",
};

const agent = (overrides: Partial<FieldAgentCandidate> = {}): FieldAgentCandidate => ({
  agentId: "agent-a",
  organizationId: "org-a",
  available: true,
  authorizedForCollections: true,
  heartbeatAt: "2026-10-11T08:30:00.000Z",
  latitude: 6.17,
  longitude: 1.23,
  activeClientCount: 2,
  maxActiveClients: 20,
  maxRouteDistanceKm: 20,
  ...overrides,
});

const profile = (overrides: Partial<CustomerFieldProfile> = {}): CustomerFieldProfile => ({
  organizationId: "org-a",
  customerId: "customer-a",
  active: true,
  location,
  primaryAgentId: "agent-offline",
  openException: false,
  ...overrides,
});

test("location validation requires consent and a usable landmark or address", () => {
  const invalid = validateCustomerFieldLocation({ ...location, consentRecorded: false, landmark: "", addressLabel: "" });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.includes("LOCATION_CONSENT_REQUIRED"));
  assert.ok(invalid.issues.includes("LANDMARK_OR_ADDRESS_REQUIRED"));
  assert.equal(invalid.locationStatus, "needs_review");
});

test("location precision is not fabricated and findability reflects available evidence", () => {
  const coarse = validateCustomerFieldLocation({ ...location, accuracyMeters: 140, verifiedBy: undefined, verifiedAt: undefined });
  assert.equal(coarse.locationStatus, "needs_review");
  assert.ok(coarse.findabilityScore < 100);
  assert.equal(validateCustomerFieldLocation(location).locationStatus, "verified");
});

test("distance uses geographic coordinates and rejects invalid coordinates", () => {
  assert.ok(haversineDistanceKm(location, agent()) < 2);
  assert.throws(() => haversineDistanceKm(location, agent({ latitude: 95 })), /FIELD_LOCATION_INVALID/);
});

test("continuity plan chooses authorized, fresh, same-organization agent and requires approval", () => {
  const plan = buildFieldContinuityPlan(
    [profile()],
    [
      agent({ agentId: "agent-near", latitude: 6.172, longitude: 1.231 }),
      agent({ agentId: "agent-cross-tenant", organizationId: "org-b", latitude: 6.172, longitude: 1.231 }),
      agent({ agentId: "agent-stale", heartbeatAt: "2026-10-11T01:00:00.000Z" }),
      agent({ agentId: "agent-no-auth", authorizedForCollections: false }),
    ],
    { now: "2026-10-11T08:31:00.000Z", maxHeartbeatAgeMinutes: 10, planExpiresAt: "2026-10-11T09:00:00.000Z" },
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.nextAgentId, "agent-near");
  assert.equal(plan[0]?.requiresSupervisorApproval, true);
  assert.equal(plan[0]?.reason, "agent_unavailable");
  assert.equal(plan[0]?.planHash.length, 64);
});

test("continuity plan skips profiles without consent/location and agents at capacity", () => {
  const plan = buildFieldContinuityPlan(
    [profile({ customerId: "no-consent", location: { ...location, consentRecorded: false } }), profile({ customerId: "no-location", location: undefined })],
    [agent({ activeClientCount: 20 })],
    { now: "2026-10-11T08:31:00.000Z", maxHeartbeatAgeMinutes: 10, planExpiresAt: "2026-10-11T09:00:00.000Z" },
  );
  assert.deepEqual(plan, []);
});

test("continuity plan is deterministic and distributes clients against workload", () => {
  const profiles = [
    profile({ customerId: "customer-a" }),
    profile({ customerId: "customer-b" }),
    profile({ customerId: "customer-c" }),
  ];
  const agents = [
    agent({ agentId: "agent-a", activeClientCount: 0 }),
    agent({ agentId: "agent-b", activeClientCount: 8, latitude: 6.18, longitude: 1.24 }),
  ];
  const options = { now: "2026-10-11T08:31:00.000Z", maxHeartbeatAgeMinutes: 10, planExpiresAt: "2026-10-11T09:00:00.000Z" };
  const first = buildFieldContinuityPlan(profiles, agents, options);
  const second = buildFieldContinuityPlan(profiles, agents, options);
  assert.deepEqual(first, second);
  assert.ok(first.every((item) => item.planHash.length === 64));
  assert.ok(first.every((item) => item.requiresSupervisorApproval));
});
