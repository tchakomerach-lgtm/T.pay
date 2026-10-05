import { createHash } from "node:crypto";
import type { Client } from "pg";
import {
  assertSafeSecurityMetadata,
  securityEventHash,
  type ApprovalConsumeResult,
  type DurableSecurityStore,
  type ReplayClaimResult,
  type SecurityEventInput,
} from "../../security/src/durable-security.js";

export class PostgresDurableSecurityStore implements DurableSecurityStore {
  constructor(private readonly client: Client) {}

  async claimReplay(input: {
    tenantId: string; jti: string; requestDigest: string; expiresAt: string;
    source: "user" | "agent" | "system";
  }): Promise<ReplayClaimResult> {
    const inserted = await this.client.query(
      `INSERT INTO security_replay_claims
         (tenant_id,jti,request_digest,source,first_seen_at,expires_at)
       VALUES ($1,$2,$3,$4,now(),$5)
       ON CONFLICT (tenant_id,jti) DO NOTHING
       RETURNING jti`,
      [input.tenantId, input.jti, input.requestDigest, input.source, input.expiresAt]
    );
    if (inserted.rowCount === 1) return "CLAIMED";
    const existing = await this.client.query<{request_digest:string}>(
      "SELECT request_digest FROM security_replay_claims WHERE tenant_id=$1 AND jti=$2",
      [input.tenantId, input.jti]
    );
    const digest = existing.rows[0]?.request_digest;
    if (!digest) throw new Error("REPLAY_STATE_LOST");
    return digest === input.requestDigest ? "REPLAY" : "DIGEST_CONFLICT";
  }

  async createApproval(input: {
    approvalId: string; tenantId: string; approverId: string; subjectActorId: string; requestDigest: string; expiresAt: string;
  }): Promise<void> {
    if (input.approverId === input.subjectActorId) throw new Error("SELF_APPROVAL_FORBIDDEN");
    const result = await this.client.query(
      `INSERT INTO security_approvals
         (approval_id,tenant_id,approver_id,subject_actor_id,request_digest,status,created_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,'pending',now(),$6)
       ON CONFLICT (approval_id) DO NOTHING
       RETURNING approval_id`,
      [input.approvalId, input.tenantId, input.approverId, input.subjectActorId, input.requestDigest, input.expiresAt]
    );
    if (result.rowCount !== 1) throw new Error("APPROVAL_ID_CONFLICT");
  }

  async consumeApproval(input: {
    approvalId: string; tenantId: string; requestDigest: string; now: string;
  }): Promise<ApprovalConsumeResult> {
    const consumed = await this.client.query(
      `UPDATE security_approvals
          SET status='consumed', consumed_at=$4
        WHERE approval_id=$1
          AND tenant_id=$2
          AND request_digest=$3
          AND status='pending'
          AND expires_at>$4::timestamptz
        RETURNING approval_id`,
      [input.approvalId, input.tenantId, input.requestDigest, input.now]
    );
    if (consumed.rowCount === 1) return "CONSUMED";
    const row = await this.client.query<{status:string;request_digest:string;expires_at:string}>(
      "SELECT status,request_digest,expires_at::text FROM security_approvals WHERE approval_id=$1 AND tenant_id=$2",
      [input.approvalId, input.tenantId]
    );
    const approval = row.rows[0];
    if (!approval) return "MISSING";
    if (approval.request_digest !== input.requestDigest) return "DIGEST_MISMATCH";
    if (approval.status === "consumed") return "ALREADY_CONSUMED";
    if (Date.parse(approval.expires_at) <= Date.parse(input.now)) return "EXPIRED";
    return "MISSING";
  }

  async appendSecurityEvent(input: SecurityEventInput): Promise<string> {
    assertSafeSecurityMetadata(input.metadata ?? {});
    const tx = this.client;
    await tx.query("BEGIN");
    try {
      const head = await tx.query<{last_sequence:string;last_hash:string|null}>(
        `INSERT INTO security_event_heads(tenant_id,last_sequence,last_hash)
         VALUES($1,0,NULL)
         ON CONFLICT (tenant_id) DO UPDATE SET last_sequence=security_event_heads.last_sequence
         RETURNING last_sequence,last_hash`,
        [input.tenantId]
      );
      await tx.query("SELECT tenant_id FROM security_event_heads WHERE tenant_id=$1 FOR UPDATE",[input.tenantId]);
      const current = head.rows[0];
      if (!current) throw new Error("SECURITY_EVENT_HEAD_MISSING");
      const sequence = Number(current.last_sequence) + 1;
      const hash = securityEventHash(input,current.last_hash);
      await tx.query(
        `INSERT INTO security_events
          (event_id,tenant_id,sequence,request_id,actor_id,occurred_at,decision,reason_code,
           policy_version,policy_revision,request_digest,decision_source,rule_ids,metadata,previous_hash,event_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16)`,
        [
          input.eventId,input.tenantId,sequence,input.requestId,input.actorId,input.occurredAt,
          input.decision,input.reasonCode,input.provenance.policyVersion,input.provenance.policyRevision,
          input.provenance.requestDigest,input.provenance.decisionSource,
          JSON.stringify(input.provenance.ruleIds),JSON.stringify(input.metadata ?? {}),
          current.last_hash,hash
        ]
      );
      await tx.query(
        "UPDATE security_event_heads SET last_sequence=$2,last_hash=$3 WHERE tenant_id=$1",
        [input.tenantId,sequence,hash]
      );
      await tx.query("COMMIT");
      return hash;
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    }
  }
}

export function hashSecurityReference(reference: string): string {
  return createHash("sha256").update(reference,"utf8").digest("hex");
}
