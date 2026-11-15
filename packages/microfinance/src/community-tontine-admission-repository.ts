import type { UUID } from "../../domain/src/types.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";
import type {
  Candidate, CandidateState, AdmissionDecision, ConsentGrant, ThirdPartyTrustAttestation,
  LaunchAggregate, LaunchState
} from "./community-tontine-admission.js";

export interface CommunityTontineAdmissionRepository {
  createCandidate(organizationId: UUID, candidate: Candidate): Promise<void>;
  recordConsent(organizationId: UUID, consent: ConsentGrant & { id: UUID; termsVersion: string;
    contributionAmountMinor?: bigint; currency?: string; cadence?: "DAILY"|"WEEKLY"|"MONTHLY"|"CUSTOM";
    rotationOrderHash?: string }): Promise<void>;
  revokeConsent(organizationId: UUID, groupId: UUID, consentId: UUID, revokedAt: string): Promise<void>;
  recordAttestation(organizationId: UUID, attestation: ThirdPartyTrustAttestation): Promise<void>;
  decideMembership(input: { organizationId: UUID; candidateId: UUID; groupId: UUID;
    expectedState: CandidateState; nextState: CandidateState; decision: AdmissionDecision;
    actorId: UUID; reason: string; decidedAt: string }): Promise<void>;
  armLaunch(input: { organizationId: UUID; groupId: UUID; snapshotId: UUID; configHash: string;
    rotationSnapshotHash: string; canonicalPayload: string; idempotencyKey: string; actorId: UUID; armedAt: string }): Promise<void>;
  activateLaunch(input: { organizationId: UUID; groupId: UUID; snapshotId: UUID;
    configHash: string; idempotencyKey: string; actorId: UUID; activatedAt: string }): Promise<void>;
}

const HASH = /^[a-f0-9]{64}$/i;
const VALID_CANDIDATE_STATES = new Set<CandidateState>([
  "DISCOVERED","APPLIED","VERIFYING","APPROVED","ACTIVE","REJECTED","EXPIRED","WITHDRAWN","SUSPENDED"
]);

export class PostgresCommunityTontineAdmissionRepository implements CommunityTontineAdmissionRepository {
  constructor(private readonly db: TontineSqlExecutor) {}

  async createCandidate(organizationId: UUID, candidate: Candidate): Promise<void> {
    if (!VALID_CANDIDATE_STATES.has(candidate.state)) throw new Error("COMMUNITY_TONTINE_CANDIDATE_STATE_INVALID");
    await this.db.query(
      `INSERT INTO community_tontine_candidates
       (id,organization_id,group_id,state,applied_at,membership_lock_at,decision,decision_by,decision_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [candidate.id,organizationId,candidate.groupId,candidate.state,candidate.appliedAt,
       candidate.membershipLockAt ?? null,candidate.decision ?? null,candidate.decisionBy ?? null,
       candidate.decisionReason ?? null]
    );
  }

  async recordConsent(organizationId: UUID, consent: ConsentGrant & { id: UUID; termsVersion: string;
    contributionAmountMinor?: bigint; currency?: string; cadence?: "DAILY"|"WEEKLY"|"MONTHLY"|"CUSTOM";
    rotationOrderHash?: string }): Promise<void> {
    if (Date.parse(consent.expiresAt) <= Date.parse(consent.grantedAt)) throw new Error("COMMUNITY_TONTINE_CONSENT_WINDOW_INVALID");
    if (consent.purpose === "FINAL_PARTICIPATION" &&
      (consent.contributionAmountMinor === undefined || consent.contributionAmountMinor <= 0n ||
       !consent.currency || !consent.cadence || !consent.rotationOrderHash || !HASH.test(consent.rotationOrderHash))) {
      throw new Error("COMMUNITY_TONTINE_FINAL_CONSENT_TERMS_REQUIRED");
    }
    await this.db.query(
      `INSERT INTO community_tontine_consents
       (id,organization_id,group_id,candidate_id,partner_id,purpose,terms_version,granted_at,expires_at,revoked_at,
        contribution_amount_minor,currency,cadence,rotation_order_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [consent.id,organizationId,consent.groupId,consent.candidateId,consent.partnerId,consent.purpose,
       consent.termsVersion,consent.grantedAt,consent.expiresAt,consent.revokedAt ?? null,
       consent.contributionAmountMinor?.toString() ?? null,consent.currency ?? null,consent.cadence ?? null,
       consent.rotationOrderHash ?? null]
    );
  }

  async revokeConsent(organizationId: UUID, groupId: UUID, consentId: UUID, revokedAt: string): Promise<void> {
    const result = await this.db.query(
      `UPDATE community_tontine_consents SET revoked_at=$4
       WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND revoked_at IS NULL AND expires_at > $4
       RETURNING id`,
      [organizationId,groupId,consentId,revokedAt]
    );
    if ((result.rowCount ?? result.rows.length) !== 1) throw new Error("COMMUNITY_TONTINE_CONSENT_NOT_REVOCABLE");
  }

  async recordAttestation(organizationId: UUID, a: ThirdPartyTrustAttestation): Promise<void> {
    if (Date.parse(a.expiresAt) <= Date.parse(a.issuedAt) || a.trustLevel < 0 || a.trustLevel > 4 || !a.signature.trim()) {
      throw new Error("COMMUNITY_TONTINE_ATTESTATION_INVALID");
    }
    await this.db.query(
      `INSERT INTO community_tontine_trust_attestations
       (id,organization_id,group_id,candidate_id,partner_id,agent_id,verification_ref,match_result,status,
        trust_level,issued_at,expires_at,signature,revoked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [a.id,organizationId,a.groupId,a.candidateId,a.partnerId,a.agentId,a.verificationRef,a.match,a.status,
       a.trustLevel,a.issuedAt,a.expiresAt,a.signature,a.revokedAt ?? null]
    );
  }

  async decideMembership(input: { organizationId: UUID; candidateId: UUID; groupId: UUID;
    expectedState: CandidateState; nextState: CandidateState; decision: AdmissionDecision;
    actorId: UUID; reason: string; decidedAt: string }): Promise<void> {
    if (!input.reason.trim() || !VALID_CANDIDATE_STATES.has(input.nextState)) {
      throw new Error("COMMUNITY_TONTINE_ADMISSION_DECISION_INVALID");
    }
    await this.db.transaction(async tx => {
      const updated = await tx.query<{state: CandidateState}>(
        `UPDATE community_tontine_candidates
         SET state=$5,decision=$6,decision_by=$7,decision_reason=$8,version=version+1,last_modified_at=$9
         WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state=$4
         RETURNING state`,
        [input.organizationId,input.groupId,input.candidateId,input.expectedState,input.nextState,
         input.decision,input.actorId,input.reason.trim(),input.decidedAt]
      );
      if ((updated.rowCount ?? updated.rows.length) !== 1) throw new Error("COMMUNITY_TONTINE_ADMISSION_STATE_CONFLICT");
      await tx.query(
        `INSERT INTO community_tontine_admission_audit
         (organization_id,group_id,candidate_id,actor_id,decision,previous_state,new_state,reason,occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.organizationId,input.groupId,input.candidateId,input.actorId,input.decision,
         input.expectedState,input.nextState,input.reason.trim(),input.decidedAt]
      );
    });
  }

  async armLaunch(input: { organizationId: UUID; groupId: UUID; snapshotId: UUID; configHash: string;
    rotationSnapshotHash: string; canonicalPayload: string; idempotencyKey: string; actorId: UUID; armedAt: string }): Promise<void> {
    if (!HASH.test(input.configHash) || !HASH.test(input.rotationSnapshotHash) || !input.idempotencyKey.trim()) {
      throw new Error("COMMUNITY_TONTINE_LAUNCH_SNAPSHOT_INVALID");
    }
    let payload: unknown;
    try { payload = JSON.parse(input.canonicalPayload); } catch { throw new Error("COMMUNITY_TONTINE_LAUNCH_PAYLOAD_INVALID"); }
    const inserted = await this.db.query(
      `INSERT INTO community_tontine_launch_snapshots
       (id,organization_id,group_id,config_hash,rotation_snapshot_hash,canonical_payload,idempotency_key,
        state,armed_by,armed_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'ARMED',$8,$9)
       ON CONFLICT (organization_id,group_id,idempotency_key) DO NOTHING
       RETURNING id`,
      [input.snapshotId,input.organizationId,input.groupId,input.configHash,input.rotationSnapshotHash,
       JSON.stringify(payload),input.idempotencyKey,input.actorId,input.armedAt]
    );
    if ((inserted.rowCount ?? inserted.rows.length) === 1) return;
    const replay = await this.db.query(
      `SELECT id FROM community_tontine_launch_snapshots
       WHERE organization_id=$1 AND group_id=$2 AND idempotency_key=$3
         AND config_hash=$4 AND rotation_snapshot_hash=$5 AND canonical_payload=$6::jsonb AND state='ARMED'`,
      [input.organizationId,input.groupId,input.idempotencyKey,input.configHash,input.rotationSnapshotHash,
       JSON.stringify(payload)]
    );
    if (replay.rows.length !== 1) throw new Error("COMMUNITY_TONTINE_LAUNCH_IDEMPOTENCY_CONFLICT");
  }

  async activateLaunch(input: { organizationId: UUID; groupId: UUID; snapshotId: UUID;
    configHash: string; idempotencyKey: string; actorId: UUID; activatedAt: string }): Promise<void> {
    const result = await this.db.query(
      `UPDATE community_tontine_launch_snapshots
       SET state='ACTIVE',activated_by=$7,activated_at=$8,version=version+1
       WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND config_hash=$4
         AND idempotency_key=$5 AND state='ARMED'
       RETURNING id`,
      [input.organizationId,input.groupId,input.snapshotId,input.configHash,input.idempotencyKey,
       input.actorId,input.actorId,input.activatedAt]
    );
    if ((result.rowCount ?? result.rows.length) !== 1) throw new Error("COMMUNITY_TONTINE_LAUNCH_ACTIVATION_CONFLICT");
  }
}
