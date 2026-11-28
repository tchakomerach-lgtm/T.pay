import { randomUUID } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";
import {
  computeTontineProtectionPolicyHash,
  evaluateTontineProtectionClaim,
  quoteTontineProtectionPremium,
  validateTontineProtectionPolicy,
  type CommunityTontineProtectionPolicy,
  type TontineProtectionClaimEvidence,
  type TontineProtectionTier
} from "./community-tontine-protection.js";

type ProtectionRow = Record<string, unknown>;
const iso = (value: unknown): string => new Date(String(value)).toISOString();
const big = (value: unknown): bigint => BigInt(String(value));
function policyFromRow(row: ProtectionRow): CommunityTontineProtectionPolicy {
  const raw = typeof row.tiers === "string" ? JSON.parse(row.tiers) as Array<Record<string, unknown>> : row.tiers as Array<Record<string, unknown>>;
  if (!Array.isArray(raw)) throw new Error("TONTINE_PROTECTION_TIERS_INVALID");
  const policy: CommunityTontineProtectionPolicy = {
    id: String(row.policy_id ?? row.id) as UUID,
    organizationId: String(row.organization_id) as UUID,
    groupId: String(row.group_id) as UUID,
    version: String(row.version),
    currency: String(row.currency),
    state: (row.policy_state ?? row.state) as CommunityTontineProtectionPolicy["state"],
    proposalOrigin: row.proposal_origin as CommunityTontineProtectionPolicy["proposalOrigin"],
    riskBearer: "LICENSED_INSURER",
    insurerPartnerId: String(row.insurer_partner_id) as UUID,
    insurerLicenseReference: String(row.insurer_license_reference),
    insurerContractReference: String(row.insurer_contract_reference),
    insurerLicenseVerified: row.insurer_license_verified === true,
    insurerContractVerified: row.insurer_contract_verified === true,
    effectiveFrom: iso(row.effective_from),
    ...(row.effective_until ? { effectiveUntil: iso(row.effective_until) } : {}),
    tiers: raw.map((tier) => ({
      tier: String(tier.tier) as TontineProtectionTier,
      premiumRateBps: Number(tier.premiumRateBps),
      coveredInstallments: Number(tier.coveredInstallments),
      gracePeriodDays: Number(tier.gracePeriodDays),
      waitingPeriodDays: Number(tier.waitingPeriodDays),
      maxClaimMinor: big(tier.maxClaimMinor)
    })),
    createdBy: String(row.created_by) as UUID,
    ...(row.approved_by ? { approvedBy: String(row.approved_by) as UUID } : {}),
    policyHash: String(row.policy_hash)
  };
  return policy;
}
function tiersJson(policy: CommunityTontineProtectionPolicy): string {
  return JSON.stringify(policy.tiers.map((tier) => ({
    tier: tier.tier,
    premiumRateBps: tier.premiumRateBps,
    coveredInstallments: tier.coveredInstallments,
    gracePeriodDays: tier.gracePeriodDays,
    waitingPeriodDays: tier.waitingPeriodDays,
    maxClaimMinor: tier.maxClaimMinor.toString()
  })));
}
async function appendEvent(tx: TontineSqlExecutor, input: {
  organizationId: UUID; groupId: UUID; actorId: UUID; eventType: string;
  payload: Record<string, unknown>; enrollmentId?: UUID; claimId?: UUID; now: string;
}): Promise<void> {
  await tx.query(
    `INSERT INTO community_tontine_protection_events
     (id,organization_id,group_id,enrollment_id,claim_id,actor_id,event_type,payload,occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [randomUUID(), input.organizationId, input.groupId, input.enrollmentId ?? null,
      input.claimId ?? null, input.actorId, input.eventType, JSON.stringify(input.payload), input.now]
  );
}

/**
 * Persistence boundary for CT-042. It never writes a Financial Core ledger entry.
 * A premium is marked SETTLED only after a trusted Financial Core verifier has confirmed
 * the referenced settlement outside this repository.
 */
export class PostgresCommunityTontineProtectionRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async listPolicies(input: { organizationId: UUID; groupId: UUID; state?: CommunityTontineProtectionPolicy["state"] }): Promise<CommunityTontineProtectionPolicy[]> {
    const result = await this.db.query<ProtectionRow>(
      `SELECT * FROM community_tontine_protection_policies
       WHERE organization_id=$1 AND group_id=$2 AND ($3::text IS NULL OR state=$3)
       ORDER BY created_at DESC,id DESC LIMIT 100`,
      [input.organizationId, input.groupId, input.state ?? null]
    );
    return result.rows.map(policyFromRow);
  }

  async getPolicyForUpdate(tx: TontineSqlExecutor, organizationId: UUID, groupId: UUID, policyId: UUID): Promise<CommunityTontineProtectionPolicy> {
    const result = await tx.query<ProtectionRow>(
      `SELECT * FROM community_tontine_protection_policies
       WHERE organization_id=$1 AND group_id=$2 AND id=$3 FOR UPDATE`,
      [organizationId, groupId, policyId]
    );
    if (!result.rows[0]) throw new Error("TONTINE_PROTECTION_POLICY_NOT_FOUND");
    return policyFromRow(result.rows[0]);
  }

  async createPolicy(policy: CommunityTontineProtectionPolicy, now: string): Promise<void> {
    if (policy.state !== "DRAFT" || policy.approvedBy) throw new Error("TONTINE_PROTECTION_POLICY_MUST_START_DRAFT");
    const hash = computeTontineProtectionPolicyHash(policy);
    const candidate = { ...policy, policyHash: hash };
    validateTontineProtectionPolicy(candidate);
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO community_tontine_protection_policies
         (id,organization_id,group_id,version,currency,state,proposal_origin,risk_bearer,
          insurer_partner_id,insurer_license_reference,insurer_contract_reference,
          insurer_license_verified,insurer_contract_verified,effective_from,effective_until,
          tiers,policy_hash,created_by,created_at)
         VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,'LICENSED_INSURER',$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17)`,
        [policy.id, policy.organizationId, policy.groupId, policy.version, policy.currency,
          policy.proposalOrigin, policy.insurerPartnerId, policy.insurerLicenseReference,
          policy.insurerContractReference, policy.insurerLicenseVerified, policy.insurerContractVerified,
          policy.effectiveFrom, policy.effectiveUntil ?? null, tiersJson(candidate), hash, policy.createdBy, now]
      );
      await appendEvent(tx, {
        organizationId: policy.organizationId, groupId: policy.groupId, actorId: policy.createdBy,
        eventType: "POLICY_PROPOSED", payload: { policyId: policy.id, version: policy.version, policyHash: hash },
        now
      });
    });
  }

  async verifyInsurerDocuments(input: {
    organizationId: UUID; groupId: UUID; policyId: UUID; actorId: UUID;
    licenseEvidenceReference: string; licenseEvidenceSha256: string;
    contractEvidenceReference: string; contractEvidenceSha256: string; now: string;
  }): Promise<void> {
    const validReference = (value: string): boolean =>
      value.length >= 1 && value.length <= 512 && /^[A-Za-z0-9._:/-]+$/.test(value);
    const licenseHash = input.licenseEvidenceSha256.toLowerCase();
    const contractHash = input.contractEvidenceSha256.toLowerCase();
    if (!validReference(input.licenseEvidenceReference) ||
        !validReference(input.contractEvidenceReference) ||
        !/^[a-f0-9]{64}$/.test(licenseHash) ||
        !/^[a-f0-9]{64}$/.test(contractHash)) {
      throw new Error("TONTINE_PROTECTION_VERIFICATION_EVIDENCE_INVALID");
    }
    await this.db.transaction(async (tx) => {
      const policy = await this.getPolicyForUpdate(tx, input.organizationId, input.groupId, input.policyId);
      if (policy.state !== "DRAFT") throw new Error("TONTINE_PROTECTION_POLICY_NOT_DRAFT");
      if (policy.createdBy === input.actorId) throw new Error("TONTINE_PROTECTION_VERIFIER_SEPARATION_REQUIRED");
      const evidence = [
        { id: randomUUID(), type: "INSURER_LICENSE", reference: input.licenseEvidenceReference, hash: licenseHash },
        { id: randomUUID(), type: "EXECUTED_CONTRACT", reference: input.contractEvidenceReference, hash: contractHash }
      ];
      for (const item of evidence) {
        await tx.query(
          `INSERT INTO community_tontine_insurer_verification_evidence
           (id,organization_id,group_id,policy_id,document_type,evidence_reference,evidence_sha256,verified_by,verified_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [item.id, input.organizationId, input.groupId, input.policyId, item.type,
            item.reference, item.hash, input.actorId, input.now]
        );
      }
      const verified = { ...policy, insurerLicenseVerified: true, insurerContractVerified: true };
      const policyHash = computeTontineProtectionPolicyHash(verified);
      const updated = await tx.query(
        `UPDATE community_tontine_protection_policies
         SET insurer_license_verified=true,insurer_contract_verified=true,policy_hash=$4
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='DRAFT'`,
        [input.organizationId, input.groupId, input.policyId, policyHash]
      );
      if ((updated.rowCount ?? 0) !== 1) throw new Error("TONTINE_PROTECTION_PARTNER_VERIFICATION_CONFLICT");
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        eventType: "POLICY_INSURER_PARTNER_VERIFIED",
        payload: {
          policyId: input.policyId,
          evidenceIds: evidence.map((item) => item.id),
          licenseEvidenceSha256: licenseHash,
          contractEvidenceSha256: contractHash,
          policyHash
        },
        now: input.now
      });
    });
  }

  async approvePolicy(input: { organizationId: UUID; groupId: UUID; policyId: UUID; actorId: UUID; now: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const policy = await this.getPolicyForUpdate(tx, input.organizationId, input.groupId, input.policyId);
      validateTontineProtectionPolicy(policy);
      if (policy.createdBy === input.actorId) throw new Error("TONTINE_PROTECTION_MAKER_CHECKER_REQUIRED");
      if (policy.state !== "DRAFT") throw new Error("TONTINE_PROTECTION_POLICY_NOT_DRAFT");
      if (!policy.insurerLicenseVerified || !policy.insurerContractVerified) throw new Error("TONTINE_PROTECTION_PARTNER_VERIFICATION_REQUIRED");
      const evidence = await tx.query<ProtectionRow>(
        `SELECT COUNT(*)::integer AS total,BOOL_AND(verified_by<>$4) AS independent
         FROM (SELECT DISTINCT ON (document_type) document_type,verified_by
               FROM community_tontine_insurer_verification_evidence
               WHERE organization_id=$1 AND group_id=$2 AND policy_id=$3
               ORDER BY document_type,verified_at DESC,id DESC) latest`,
        [input.organizationId, input.groupId, input.policyId, input.actorId]
      );
      if (Number(evidence.rows[0]?.total ?? 0) !== 2 || evidence.rows[0]?.independent !== true) {
        throw new Error("TONTINE_PROTECTION_PARTNER_VERIFICATION_REQUIRED");
      }
      const updated = await tx.query(
        `UPDATE community_tontine_protection_policies SET state='APPROVED',approved_by=$4
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='DRAFT'`,
        [input.organizationId, input.groupId, input.policyId, input.actorId]
      );
      if ((updated.rowCount ?? 0) !== 1) throw new Error("TONTINE_PROTECTION_POLICY_APPROVAL_CONFLICT");
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        eventType: "POLICY_APPROVED", payload: { policyId: input.policyId }, now: input.now
      });
    });
  }

  async activatePolicy(input: { organizationId: UUID; groupId: UUID; policyId: UUID; actorId: UUID; now: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const policy = await this.getPolicyForUpdate(tx, input.organizationId, input.groupId, input.policyId);
      validateTontineProtectionPolicy(policy);
      if (policy.state !== "APPROVED" || !policy.approvedBy) throw new Error("TONTINE_PROTECTION_APPROVAL_REQUIRED");
      if (policy.approvedBy === input.actorId || policy.createdBy === input.actorId) throw new Error("TONTINE_PROTECTION_ACTIVATION_SEPARATION_REQUIRED");
      if (!policy.insurerLicenseVerified || !policy.insurerContractVerified) throw new Error("TONTINE_PROTECTION_PARTNER_VERIFICATION_REQUIRED");
      const evidence = await tx.query<ProtectionRow>(
        `SELECT COUNT(*)::integer AS total,BOOL_AND(verified_by<>$4) AS independent
         FROM (SELECT DISTINCT ON (document_type) document_type,verified_by
               FROM community_tontine_insurer_verification_evidence
               WHERE organization_id=$1 AND group_id=$2 AND policy_id=$3
               ORDER BY document_type,verified_at DESC,id DESC) latest`,
        [input.organizationId, input.groupId, input.policyId, input.actorId]
      );
      if (Number(evidence.rows[0]?.total ?? 0) !== 2 || evidence.rows[0]?.independent !== true) {
        throw new Error("TONTINE_PROTECTION_PARTNER_VERIFICATION_REQUIRED");
      }
      await tx.query(
        `UPDATE community_tontine_protection_policies SET state='RETIRED'
         WHERE organization_id=$1 AND group_id=$2 AND state='ACTIVE'`,
        [input.organizationId, input.groupId]
      );
      const updated = await tx.query(
        `UPDATE community_tontine_protection_policies
         SET state='ACTIVE',activated_at=$4
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='APPROVED'`,
        [input.organizationId, input.groupId, input.policyId, input.now]
      );
      if ((updated.rowCount ?? 0) !== 1) throw new Error("TONTINE_PROTECTION_POLICY_ACTIVATION_CONFLICT");
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        eventType: "POLICY_ACTIVATED", payload: { policyId: input.policyId, policyHash: policy.policyHash }, now: input.now
      });
    });
  }

  async enrollMember(input: {
    organizationId: UUID; groupId: UUID; membershipId: UUID; policyId: UUID;
    tier: TontineProtectionTier; actorId: UUID; acceptedAt: string; coverageStartsAt: string;
    consentReference: string; now: string;
  }): Promise<UUID> {
    if (!input.consentReference.trim()) throw new Error("TONTINE_PROTECTION_EXPLICIT_CONSENT_REQUIRED");
    if (Date.parse(input.coverageStartsAt) < Date.parse(input.acceptedAt)) throw new Error("TONTINE_PROTECTION_COVERAGE_DATE_INVALID");
    const id = randomUUID() as UUID;
    await this.db.transaction(async (tx) => {
      const policy = await this.getPolicyForUpdate(tx, input.organizationId, input.groupId, input.policyId);
      if (policy.state !== "ACTIVE") throw new Error("TONTINE_PROTECTION_POLICY_NOT_ACTIVE");
      if (!policy.tiers.some((tier) => tier.tier === input.tier)) throw new Error("TONTINE_PROTECTION_TIER_NOT_FOUND");
      const membership = await tx.query(
        `SELECT id FROM tontine_memberships
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND status='active' FOR SHARE`,
        [input.organizationId, input.groupId, input.membershipId]
      );
      if (!membership.rows[0]) throw new Error("TONTINE_PROTECTION_ACTIVE_MEMBERSHIP_REQUIRED");
      await tx.query(
        `INSERT INTO community_tontine_protection_enrollments
         (id,organization_id,group_id,member_id,policy_id,tier,state,accepted_at,coverage_starts_at,consent_reference)
         VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8,$9)`,
        [id, input.organizationId, input.groupId, input.membershipId, input.policyId,
          input.tier, input.acceptedAt, input.coverageStartsAt, input.consentReference]
      );
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        enrollmentId: id, eventType: "ENROLLED",
        payload: { policyId: input.policyId, membershipId: input.membershipId, tier: input.tier, consentReference: input.consentReference },
        now: input.now
      });
    });
    return id;
  }

  async createPremiumSchedule(input: {
    organizationId: UUID; groupId: UUID; enrollmentId: UUID; installmentReference: UUID;
    actorId: UUID; now: string;
  }): Promise<{ id: UUID; premiumMinor: bigint; rateBps: number; coverageLimitMinor: bigint }> {
    const result = await this.db.transaction(async (tx) => {
      const joined = await tx.query<ProtectionRow>(
        `SELECT e.id AS enrollment_id,e.member_id,e.organization_id,e.group_id,e.policy_id,e.tier,e.state AS enrollment_state,
                p.id AS policy_id,p.version,p.currency,p.state,p.proposal_origin,p.risk_bearer,p.insurer_partner_id,
                p.insurer_license_reference,p.insurer_contract_reference,p.insurer_license_verified,
                p.insurer_contract_verified,p.effective_from,p.effective_until,p.tiers,p.policy_hash,
                p.created_by,p.approved_by
         FROM community_tontine_protection_enrollments e
         JOIN community_tontine_protection_policies p
           ON p.organization_id=e.organization_id AND p.group_id=e.group_id AND p.id=e.policy_id
         WHERE e.organization_id=$1 AND e.group_id=$2 AND e.id=$3 FOR UPDATE OF e,p`,
        [input.organizationId, input.groupId, input.enrollmentId]
      );
      const row = joined.rows[0];
      if (!row || row.enrollment_state !== "ACTIVE") throw new Error("TONTINE_PROTECTION_ENROLLMENT_NOT_ACTIVE");
      const installment = await tx.query<ProtectionRow>(
        `SELECT id,membership_id,amount_minor,currency,scheduled_for,status
         FROM tontine_contributions
         WHERE organization_id=$1 AND group_id=$2 AND id=$3
         FOR SHARE`,
        [input.organizationId, input.groupId, input.installmentReference]
      );
      const scheduled = installment.rows[0];
      if (!scheduled) throw new Error("TONTINE_PROTECTION_INSTALLMENT_NOT_FOUND");
      if (String(scheduled.membership_id) !== String(row.member_id)) throw new Error("TONTINE_PROTECTION_INSTALLMENT_MEMBER_MISMATCH");
      if (scheduled.status !== "scheduled" && scheduled.status !== "pending") throw new Error("TONTINE_PROTECTION_INSTALLMENT_NOT_SCHEDULABLE");
      const installmentMinor = big(scheduled.amount_minor);
      const currency = String(scheduled.currency);
      const dueAt = iso(scheduled.scheduled_for);
      const policy = policyFromRow(row);
      const quote = quoteTontineProtectionPremium({
        policy, tier: row.tier as TontineProtectionTier, installmentMinor,
        currency, now: input.now
      });
      const id = randomUUID() as UUID;
      await tx.query(
        `INSERT INTO community_tontine_protection_premiums
         (id,organization_id,group_id,enrollment_id,installment_reference,currency,
          installment_minor,premium_minor,rate_bps,state,due_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DUE',$10)`,
        [id, input.organizationId, input.groupId, input.enrollmentId, input.installmentReference,
          currency, installmentMinor.toString(), quote.premiumMinor.toString(), quote.rateBps, dueAt]
      );
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        enrollmentId: input.enrollmentId, eventType: "PREMIUM_QUOTED",
        payload: { premiumId: id, installmentReference: input.installmentReference, premiumMinor: quote.premiumMinor.toString(), rateBps: quote.rateBps },
        now: input.now
      });
      return { id, premiumMinor: quote.premiumMinor, rateBps: quote.rateBps, coverageLimitMinor: quote.coverageLimitMinor };
    });
    return result;
  }

  async markPremiumPaymentPending(input: { organizationId: UUID; groupId: UUID; premiumId: UUID; paymentIntentReference: UUID; actorId: UUID; now: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const result = await tx.query(
        `UPDATE community_tontine_protection_premiums
         SET state='PAYMENT_PENDING',payment_intent_reference=$4
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='DUE'
         RETURNING enrollment_id`,
        [input.organizationId, input.groupId, input.premiumId, input.paymentIntentReference]
      );
      if ((result.rowCount ?? 0) !== 1) throw new Error("TONTINE_PROTECTION_PREMIUM_STATE_CONFLICT");
      const row = result.rows[0] as ProtectionRow | undefined;
      const enrollmentId = row?.enrollment_id as UUID | undefined;
      if (!enrollmentId) throw new Error("TONTINE_PROTECTION_PREMIUM_ENROLLMENT_NOT_FOUND");
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        enrollmentId, eventType: "PREMIUM_PAYMENT_PENDING",
        payload: { premiumId: input.premiumId, paymentIntentReference: input.paymentIntentReference }, now: input.now
      });
    });
  }

  async settlePremium(input: {
    organizationId: UUID; groupId: UUID; premiumId: UUID; financialCoreReference: UUID; actorId: UUID; settledAt: string;
    verifier: (reference: UUID, amountMinor: bigint, currency: string) => Promise<boolean>;
  }): Promise<void> {
    const snapshot = await this.db.query<ProtectionRow>(
      `SELECT premium_minor,currency,state,financial_core_reference
       FROM community_tontine_protection_premiums
       WHERE organization_id=$1 AND group_id=$2 AND id=$3`,
      [input.organizationId, input.groupId, input.premiumId]
    );
    const source = snapshot.rows[0];
    if (!source) throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_FOUND");
    if (source.state === "SETTLED" && source.financial_core_reference === input.financialCoreReference) return;
    if (source.state !== "PAYMENT_PENDING") throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_PAYABLE");
    const verified = await input.verifier(input.financialCoreReference, big(source.premium_minor), String(source.currency));
    if (!verified) throw new Error("TONTINE_PROTECTION_FINANCIAL_CORE_SETTLEMENT_UNVERIFIED");
    await this.db.transaction(async (tx) => {
      const result = await tx.query<ProtectionRow>(
        `SELECT id,premium_minor,currency,state,financial_core_reference
         FROM community_tontine_protection_premiums
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 FOR UPDATE`,
        [input.organizationId, input.groupId, input.premiumId]
      );
      const row = result.rows[0];
      if (!row) throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_FOUND");
      if (row.state === "SETTLED" && row.financial_core_reference === input.financialCoreReference) return;
      if (row.state !== "PAYMENT_PENDING" || big(row.premium_minor) !== big(source.premium_minor) || String(row.currency) !== String(source.currency)) throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_PAYABLE");
      const updated = await tx.query(
        `UPDATE community_tontine_protection_premiums
         SET state='SETTLED',financial_core_reference=$4,settled_at=$5
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='PAYMENT_PENDING'`,
        [input.organizationId, input.groupId, input.premiumId, input.financialCoreReference, input.settledAt]
      );
      if ((updated.rowCount ?? 0) !== 1) throw new Error("TONTINE_PROTECTION_PREMIUM_SETTLEMENT_CONFLICT");
      const enrollment = await tx.query<ProtectionRow>(
        `SELECT enrollment_id FROM community_tontine_protection_premiums
         WHERE organization_id=$1 AND group_id=$2 AND id=$3`,
        [input.organizationId, input.groupId, input.premiumId]
      );
      const enrollmentId = enrollment.rows[0]?.enrollment_id as UUID | undefined;
      if (!enrollmentId) throw new Error("TONTINE_PROTECTION_PREMIUM_ENROLLMENT_NOT_FOUND");
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        enrollmentId, eventType: "PREMIUM_SETTLED",
        payload: { premiumId: input.premiumId, financialCoreReference: input.financialCoreReference }, now: input.settledAt
      });
    });
  }

  async evaluateAndSubmitClaim(input: {
    organizationId: UUID; groupId: UUID; enrollmentId: UUID; installmentReference: UUID;
    actorId: UUID; evidence: Pick<TontineProtectionClaimEvidence, "memberContactAttempts" | "independentReviews" | "confirmedAbandonment" | "fraudFlag">; now: string;
  }): Promise<{ claimId: UUID; eligible: boolean; code: string; maximumPayableMinor: bigint }> {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<ProtectionRow>(
        `SELECT c.id AS premium_id,c.premium_minor,c.state AS premium_state,c.installment_minor,
                c.installment_reference,c.due_at,e.id AS enrollment_id,e.tier,e.coverage_starts_at,e.state AS enrollment_state,
                p.id AS policy_id,p.version,p.currency,p.state,p.state AS policy_state,p.proposal_origin,p.risk_bearer,p.insurer_partner_id,
                p.insurer_license_reference,p.insurer_contract_reference,p.insurer_license_verified,
                p.insurer_contract_verified,p.effective_from,p.effective_until,p.tiers,p.policy_hash,
                p.created_by,p.approved_by
         FROM community_tontine_protection_premiums c
         JOIN community_tontine_protection_enrollments e
           ON e.organization_id=c.organization_id AND e.group_id=c.group_id AND e.id=c.enrollment_id
         JOIN community_tontine_protection_policies p
           ON p.organization_id=e.organization_id AND p.group_id=e.group_id AND p.id=e.policy_id
         WHERE c.organization_id=$1 AND c.group_id=$2 AND e.id=$3 AND c.installment_reference=$4
         FOR UPDATE OF c,e,p`,
        [input.organizationId, input.groupId, input.enrollmentId, input.installmentReference]
      );
      const row = result.rows[0];
      if (!row) throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_FOUND");
      if (row.enrollment_state !== "ACTIVE" || row.policy_state !== "ACTIVE") throw new Error("TONTINE_PROTECTION_COVERAGE_NOT_ACTIVE");
      if (row.premium_state !== "SETTLED") throw new Error("TONTINE_PROTECTION_PREMIUM_NOT_SETTLED");
      const policy = policyFromRow(row);
      const decision = evaluateTontineProtectionClaim({
        policy, tier: row.tier as TontineProtectionTier,
        evidence: { ...input.evidence, scheduledInstallmentMinor: big(row.installment_minor), dueAt: iso(row.due_at), coverageStartsAt: iso(row.coverage_starts_at), now: input.now, memberWasCoveredAtDueDate: Date.parse(iso(row.coverage_starts_at)) <= Date.parse(iso(row.due_at)), premiumSettledForInstallment: true }
      });
      if (!decision.eligible) throw new Error(decision.code);
      const claimId = randomUUID() as UUID;
      await tx.query(
        `INSERT INTO community_tontine_protection_claims
         (id,organization_id,group_id,enrollment_id,installment_reference,premium_id,state,
          claimed_minor,currency,evidence,submitted_by,submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,'SUBMITTED',$7,$8,$9::jsonb,$10,$11)`,
        [claimId, input.organizationId, input.groupId, input.enrollmentId, input.installmentReference,
          row.premium_id, decision.maximumPayableMinor.toString(), row.currency,
          JSON.stringify({ ...input.evidence, scheduledInstallmentMinor: big(row.installment_minor).toString(), dueAt: iso(row.due_at), coverageStartsAt: iso(row.coverage_starts_at), now: input.now, memberWasCoveredAtDueDate: Date.parse(iso(row.coverage_starts_at)) <= Date.parse(iso(row.due_at)), premiumSettledForInstallment: true }),
          input.actorId, input.now]
      );
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.actorId,
        enrollmentId: input.enrollmentId, claimId, eventType: "CLAIM_SUBMITTED",
        payload: { code: decision.code, claimedMinor: decision.maximumPayableMinor.toString() }, now: input.now
      });
      return { claimId, eligible: true, code: decision.code, maximumPayableMinor: decision.maximumPayableMinor };
    });
  }

  async recordInsurerDecision(input: {
    organizationId: UUID; groupId: UUID; claimId: UUID; insurerActorId: UUID;
    insurerClaimReference: string; approvedMinor?: bigint; approved: boolean; now: string;
  }): Promise<void> {
    if (!input.insurerClaimReference.trim()) throw new Error("TONTINE_PROTECTION_INSURER_REFERENCE_REQUIRED");
    await this.db.transaction(async (tx) => {
      const found = await tx.query<ProtectionRow>(
        `SELECT id,submitted_by,claimed_minor,state FROM community_tontine_protection_claims
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 FOR UPDATE`,
        [input.organizationId, input.groupId, input.claimId]
      );
      const row = found.rows[0];
      if (!row) throw new Error("TONTINE_PROTECTION_CLAIM_NOT_FOUND");
      if (row.submitted_by === input.insurerActorId) throw new Error("TONTINE_PROTECTION_INSURER_REVIEW_SEPARATION_REQUIRED");
      if (row.state !== "SUBMITTED" && row.state !== "UNDER_REVIEW") throw new Error("TONTINE_PROTECTION_CLAIM_STATE_CONFLICT");
      if (input.approved && (input.approvedMinor === undefined || input.approvedMinor <= 0n || input.approvedMinor > big(row.claimed_minor))) {
        throw new Error("TONTINE_PROTECTION_INSURER_AMOUNT_INVALID");
      }
      await tx.query(
        `UPDATE community_tontine_protection_claims
         SET state=$4,approved_minor=$5,insurer_claim_reference=$6,reviewed_by=$7,resolved_at=$8
         WHERE organization_id=$1 AND group_id=$2 AND id=$3`,
        [input.organizationId, input.groupId, input.claimId, input.approved ? "APPROVED_BY_INSURER" : "REJECTED",
          input.approved ? input.approvedMinor!.toString() : null, input.insurerClaimReference, input.insurerActorId, input.now]
      );
      await appendEvent(tx, {
        organizationId: input.organizationId, groupId: input.groupId, actorId: input.insurerActorId,
        claimId: input.claimId, eventType: input.approved ? "INSURER_APPROVED" : "CLAIM_REJECTED",
        payload: { insurerClaimReference: input.insurerClaimReference, approvedMinor: input.approved ? input.approvedMinor!.toString() : null },
        now: input.now
      });
    });
  }
}
