import test from "node:test";
import assert from "node:assert/strict";
import type { UUID } from "../packages/domain/src/types.js";
import {
  projectVerifiedSkillToProfessionalProfile,
  projectEmploymentToProfessionalProfile,
  transitionOpportunityApplication
} from "../packages/people/src/professional-bridge.js";

const evidence = {
  id: "skill-1" as UUID,
  organizationId: "org-1" as UUID,
  subjectUserId: "user-1" as UUID,
  skillCode: "pharmacy.dispensing",
  skillLabel: "Dispensation pharmaceutique",
  verificationStatus: "verified" as const,
  verifiedBy: "manager-1" as UUID,
  verifiedAt: "2026-11-17T09:00:00.000Z",
  consentRef: "consent://profile-skill-001",
  shareVisibility: "public" as const,
  userConsentAt: "2026-11-17T10:00:00.000Z"
};

test("only verified and user-consented skills are projected to the professional profile", () => {
  const projected = projectVerifiedSkillToProfessionalProfile(evidence, "2026-11-18T09:00:00.000Z");
  assert.equal(projected.code, "pharmacy.dispensing");
  assert.equal(projected.visibility, "public");
  assert.equal("evidenceRef" in projected, false);
});

test("unverified, revoked or expired skills are never projected", () => {
  assert.throws(
    () => projectVerifiedSkillToProfessionalProfile({ ...evidence, verificationStatus: "pending" }, "2026-11-18T09:00:00.000Z"),
    /PEOPLE_SKILL_NOT_VERIFIED/
  );
  assert.throws(
    () => projectVerifiedSkillToProfessionalProfile({ ...evidence, consentRevokedAt: "2026-11-18T08:00:00.000Z" }, "2026-11-18T09:00:00.000Z"),
    /PEOPLE_SKILL_CONSENT_REVOKED/
  );
  assert.throws(
    () => projectVerifiedSkillToProfessionalProfile({ ...evidence, expiresAt: "2026-11-18T08:00:00.000Z" }, "2026-11-18T09:00:00.000Z"),
    /PEOPLE_SKILL_PROJECTION_NOT_ACTIVE/
  );
});

test("HR employment is projected only as a minimal, verified and consented career summary", () => {
  const employment = {
    subjectUserId: "user-1" as UUID,
    organizationId: "org-1" as UUID,
    employerDisplayName: "Pharmacie Centrale",
    positionTitle: "Pharmacien assistant",
    startedAt: "2025-01-01T00:00:00.000Z",
    employmentStatus: "active" as const,
    hrVerifiedAt: "2026-11-17T09:00:00.000Z",
    hrVerifiedBy: "manager-1" as UUID,
    userConsentAt: "2026-11-17T10:00:00.000Z",
    consentRef: "consent://employment-001"
  };
  const projected = projectEmploymentToProfessionalProfile(employment, "2026-11-18T09:00:00.000Z");
  assert.equal(projected.positionTitle, "Pharmacien assistant");
  assert.equal("salary" in projected, false);
  assert.equal("disciplinaryRecord" in projected, false);
  assert.throws(
    () => projectEmploymentToProfessionalProfile({ ...employment, consentRevokedAt: "2026-11-18T08:00:00.000Z" }, "2026-11-18T09:00:00.000Z"),
    /PEOPLE_EMPLOYMENT_CONSENT_REVOKED/
  );
  assert.throws(
    () => projectEmploymentToProfessionalProfile({ ...employment, employmentStatus: "pending" }, "2026-11-18T09:00:00.000Z"),
    /PEOPLE_EMPLOYMENT_NOT_PUBLISHABLE/
  );
});

test("candidate can withdraw only their own application", () => {
  assert.equal(
    transitionOpportunityApplication("screening", "withdrawn", "candidate", { candidateOwnsApplication: true }),
    "withdrawn"
  );
  assert.throws(
    () => transitionOpportunityApplication("screening", "withdrawn", "candidate", {}),
    /OPPORTUNITY_CANDIDATE_SCOPE_REQUIRED/
  );
});

test("candidate cannot promote or reject themselves in the recruitment pipeline", () => {
  assert.throws(
    () => transitionOpportunityApplication("submitted", "shortlisted", "candidate", { candidateOwnsApplication: true }),
    /OPPORTUNITY_APPLICATION_TRANSITION_INVALID/
  );
});

test("recruiter transitions require organization-scoped authorization", () => {
  assert.throws(
    () => transitionOpportunityApplication("submitted", "screening", "recruiter", {}),
    /OPPORTUNITY_RECRUITER_PERMISSION_REQUIRED/
  );
  assert.equal(
    transitionOpportunityApplication("submitted", "screening", "recruiter", { recruiterAuthorized: true }),
    "screening"
  );
});
