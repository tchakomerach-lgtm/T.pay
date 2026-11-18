import type { UUID } from "../../domain/src/types.js";
import type { ProfessionalSkill } from "../../social/src/contracts.js";

export type SkillVerificationStatus = "pending" | "verified" | "rejected" | "revoked";
export type SkillShareVisibility = "public" | "connections" | "organization_only";

export interface OrganizationSkillEvidence {
  readonly id: UUID;
  readonly organizationId: UUID;
  readonly subjectUserId: UUID;
  readonly skillCode: string;
  readonly skillLabel: string;
  readonly verificationStatus: SkillVerificationStatus;
  readonly verifiedBy?: UUID;
  readonly verifiedAt?: string;
  readonly expiresAt?: string;
  readonly shareVisibility: SkillShareVisibility;
  readonly userConsentAt?: string;
  readonly consentRevokedAt?: string;
}

/**
 * Projects only a user-consented, verified skill into the professional profile.
 * Internal evidence references and private HR fields are deliberately omitted.
 */
export function projectVerifiedSkillToProfessionalProfile(
  evidence: OrganizationSkillEvidence,
  now: string
): ProfessionalSkill {
  const current = Date.parse(now);
  const verified = evidence.verifiedAt ? Date.parse(evidence.verifiedAt) : Number.NaN;
  const expires = evidence.expiresAt ? Date.parse(evidence.expiresAt) : Number.POSITIVE_INFINITY;
  const consent = evidence.userConsentAt ? Date.parse(evidence.userConsentAt) : Number.NaN;

  if (!Number.isFinite(current) || !Number.isFinite(verified)
    || !Number.isFinite(consent) || !Number.isFinite(expires) && expires !== Number.POSITIVE_INFINITY) {
    throw new Error("PEOPLE_SKILL_PROJECTION_TIMESTAMP_INVALID");
  }
  if (evidence.verificationStatus !== "verified") throw new Error("PEOPLE_SKILL_NOT_VERIFIED");
  if (evidence.consentRevokedAt) throw new Error("PEOPLE_SKILL_CONSENT_REVOKED");
  if (consent > current || verified > current || current >= expires) {
    throw new Error("PEOPLE_SKILL_PROJECTION_NOT_ACTIVE");
  }

  return {
    code: evidence.skillCode,
    label: evidence.skillLabel,
    visibility: evidence.shareVisibility,
    verifiedAt: new Date(verified).toISOString(),
    ...(Number.isFinite(expires) ? { expiresAt: new Date(expires).toISOString() } : {})
  };
}

export type OpportunityApplicationStatus =
  | "submitted"
  | "screening"
  | "shortlisted"
  | "interview_scheduled"
  | "interview_completed"
  | "offer_pending"
  | "offer_sent"
  | "accepted"
  | "declined"
  | "rejected"
  | "withdrawn"
  | "closed";

const APPLICATION_TRANSITIONS: Readonly<Record<OpportunityApplicationStatus, readonly OpportunityApplicationStatus[]>> = {
  submitted: ["screening", "withdrawn", "closed"],
  screening: ["shortlisted", "rejected", "withdrawn", "closed"],
  shortlisted: ["interview_scheduled", "rejected", "withdrawn", "closed"],
  interview_scheduled: ["interview_completed", "withdrawn", "closed"],
  interview_completed: ["offer_pending", "rejected", "withdrawn", "closed"],
  offer_pending: ["offer_sent", "rejected", "withdrawn", "closed"],
  offer_sent: ["accepted", "declined", "withdrawn", "closed"],
  accepted: ["closed"],
  declined: ["closed"],
  rejected: ["closed"],
  withdrawn: ["closed"],
  closed: []
};

export function transitionOpportunityApplication(
  current: OpportunityApplicationStatus,
  next: OpportunityApplicationStatus,
  actor: "candidate" | "recruiter",
  evidence: { readonly candidateOwnsApplication?: boolean; readonly recruiterAuthorized?: boolean }
): OpportunityApplicationStatus {
  if (!APPLICATION_TRANSITIONS[current].includes(next)) {
    throw new Error("OPPORTUNITY_APPLICATION_TRANSITION_INVALID");
  }
  if (actor === "candidate") {
    if (evidence.candidateOwnsApplication !== true) throw new Error("OPPORTUNITY_CANDIDATE_SCOPE_REQUIRED");
    if (next !== "withdrawn" && next !== "declined" && next !== "accepted") {
      throw new Error("OPPORTUNITY_CANDIDATE_ACTION_NOT_ALLOWED");
    }
  } else if (next === "accepted" || next === "declined" || next === "withdrawn") {
    throw new Error("OPPORTUNITY_CANDIDATE_DECISION_REQUIRED");
  } else if (evidence.recruiterAuthorized !== true) {
    throw new Error("OPPORTUNITY_RECRUITER_PERMISSION_REQUIRED");
  }
  return next;
}
