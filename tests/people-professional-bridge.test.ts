import test from "node:test";
import assert from "node:assert/strict";
import type { UUID } from "../packages/domain/src/types.js";
import {
  projectVerifiedSkillToProfessionalProfile,
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
