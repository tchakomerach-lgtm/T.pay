import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOrganizationCapabilityEligible,
  getOrganizationCapabilityManifest,
  getSharedOrganizationCapabilities
} from "../packages/organization/src/capability-catalog.js";
import {
  assertHealthConsentActive,
  assertHealthRevenueActivation,
  classifyDutyListing,
  transitionPharmacyOrder
} from "../packages/health/src/contracts.js";

test("every organization receives the same declarative common capability catalogue", () => {
  const pharmacy = getOrganizationCapabilityManifest("pharmacy");
  const hospital = getOrganizationCapabilityManifest("hospital");
  const shared = getSharedOrganizationCapabilities().map(item => item.id).sort();
  const pharmacyShared = pharmacy.filter(item => item.scope === "shared").map(item => item.id).sort();
  const hospitalShared = hospital.filter(item => item.scope === "shared").map(item => item.id).sort();
  assert.deepEqual(pharmacyShared, shared);
  assert.deepEqual(hospitalShared, shared);
  assert.ok(shared.includes("org.crm"));
  assert.ok(shared.includes("org.internal_social"));
});

test("catalogue never advertises unimplemented CRM or social runtime as active", () => {
  const manifest = getOrganizationCapabilityManifest("pharmacy");
  for (const id of ["org.crm", "org.internal_social"] as const) {
    const entry = manifest.find(item => item.id === id);
    assert.ok(entry);
    assert.equal(entry.implementationState, "contract_only");
    assert.equal(entry.activation, "pending_implementation");
  }
});

test("pharmacy and hospital capabilities remain distinct", () => {
  assert.equal(assertOrganizationCapabilityEligible("pharmacy", "pharmacy.orders").id, "pharmacy.orders");
  assert.equal(assertOrganizationCapabilityEligible("hospital", "hospital.beds").id, "hospital.beds");
  assert.throws(
    () => assertOrganizationCapabilityEligible("pharmacy", "hospital.beds"),
    /ORGANIZATION_CAPABILITY_NOT_ELIGIBLE/
  );
  assert.throws(
    () => assertOrganizationCapabilityEligible("hospital", "pharmacy.delivery"),
    /ORGANIZATION_CAPABILITY_NOT_ELIGIBLE/
  );
});

test("clinic receives hospital care capabilities without becoming a pharmacy", () => {
  const clinic = getOrganizationCapabilityManifest("clinic");
  assert.equal(clinic.find(item => item.id === "hospital.patient_portal")?.eligible, true);
  assert.equal(clinic.find(item => item.id === "pharmacy.orders")?.eligible, false);
});

test("patient consent is scoped to actor, organization, purpose and expiry", () => {
  const grant = {
    id: "consent-1" as never,
    subjectId: "patient-1" as never,
    actorId: "actor-1" as never,
    organizationId: "hospital-1" as never,
    purpose: "care_coordination",
    scopes: ["appointment.read"],
    grantedAt: "2026-11-18T08:00:00.000Z",
    expiresAt: "2026-11-19T08:00:00.000Z"
  };
  assert.doesNotThrow(() => assertHealthConsentActive(grant, {
    actorId: "actor-1" as never,
    organizationId: "hospital-1" as never,
    purpose: "care_coordination",
    scope: "appointment.read",
    now: "2026-11-18T09:00:00.000Z"
  }));
  assert.throws(() => assertHealthConsentActive(grant, {
    actorId: "actor-2" as never,
    organizationId: "hospital-1" as never,
    purpose: "care_coordination",
    scope: "appointment.read",
    now: "2026-11-18T09:00:00.000Z"
  }), /HEALTH_CONSENT_SCOPE_MISMATCH/);
  assert.throws(() => assertHealthConsentActive(grant, {
    actorId: "actor-1" as never,
    organizationId: "hospital-1" as never,
    purpose: "marketing",
    scope: "appointment.read",
    now: "2026-11-18T09:00:00.000Z"
  }), /HEALTH_CONSENT_PURPOSE_MISMATCH/);
});

test("only verified authority-sourced duty is labelled official", () => {
  const base = {
    id: "duty-1" as never,
    organizationId: "pharmacy-1" as never,
    organizationType: "pharmacy" as const,
    serviceKind: "pharmacy" as const,
    verification: "verified" as const,
    startsAt: "2026-11-18T00:00:00.000Z",
    endsAt: "2026-11-19T00:00:00.000Z",
    timezone: "Africa/Lome",
    lastConfirmedAt: "2026-11-18T08:00:00.000Z"
  };
  assert.equal(classifyDutyListing({ ...base, source: "competent_authority" }, "2026-11-18T09:00:00.000Z"), "officially_verified");
  assert.equal(classifyDutyListing({ ...base, source: "verified_facility" }, "2026-11-18T09:00:00.000Z"), "facility_declared");
  assert.equal(classifyDutyListing({ ...base, source: "facility_self_declared" }, "2026-11-18T09:00:00.000Z"), "not_publishable");
  assert.equal(classifyDutyListing({ ...base, source: "competent_authority" }, "2026-11-20T09:00:00.000Z"), "not_publishable");
});

test("pharmacy order cannot be marked paid without Financial Core confirmation", () => {
  assert.throws(() => transitionPharmacyOrder("payment_pending", "paid", {}), /FINANCIAL_CORE_CONFIRMATION_REQUIRED/);
  assert.equal(transitionPharmacyOrder("payment_pending", "paid", { financialCorePaymentConfirmed: true }), "paid");
});

test("pharmacy order cannot be marked delivered without verified proof", () => {
  assert.throws(() => transitionPharmacyOrder("out_for_delivery", "delivered", {}), /DELIVERY_PROOF_REQUIRED/);
  assert.equal(transitionPharmacyOrder("out_for_delivery", "delivered", { deliveryProofVerified: true }), "delivered");
});

test("invalid pharmacy order transitions are rejected", () => {
  assert.throws(() => transitionPharmacyOrder("draft", "paid", { financialCorePaymentConfirmed: true }), /PHARMACY_ORDER_TRANSITION_INVALID/);
});

test("SaaS and logistics revenue require a contract", () => {
  assert.throws(() => assertHealthRevenueActivation({
    stream: "saas_subscription", jurisdiction: "TG", contractRef: " "
  }), /HEALTH_REVENUE_CONTRACT_REQUIRED/);
  assert.doesNotThrow(() => assertHealthRevenueActivation({
    stream: "saas_subscription", jurisdiction: "TG", contractRef: "contract://saas-001"
  }));
  assert.doesNotThrow(() => assertHealthRevenueActivation({
    stream: "delivery_logistics", jurisdiction: "TG", contractRef: "contract://delivery-001"
  }));
});

test("marketplace and telehealth platform fees require jurisdictional legal approval", () => {
  assert.throws(() => assertHealthRevenueActivation({
    stream: "marketplace_platform_fee", jurisdiction: "TG", contractRef: "contract://marketplace"
  }), /HEALTH_REVENUE_LEGAL_APPROVAL_REQUIRED/);
  assert.doesNotThrow(() => assertHealthRevenueActivation({
    stream: "telehealth_platform_fee",
    jurisdiction: "TG",
    contractRef: "contract://telehealth",
    legalApprovalRef: "legal-review://TG/health-fees"
  }));
});

test("clinical commissions, patient-data monetization and emergency priority sales are prohibited", () => {
  for (const stream of ["clinical_commission", "patient_data_monetization", "emergency_priority"] as const) {
    assert.throws(() => assertHealthRevenueActivation({
      stream, jurisdiction: "TG", contractRef: "contract://forbidden", legalApprovalRef: "legal://approval"
    }), /HEALTH_REVENUE_STREAM_PROHIBITED/);
  }
});
