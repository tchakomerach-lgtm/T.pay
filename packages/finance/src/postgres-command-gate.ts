import type { Client } from "pg";
import type { AuthorizedCommandClaimResult } from "../security/src/command-gate-types.js";

export interface CommandClaimStore {
  claim(input: {
    tenantId: string;
    jti: string;
    digest: string;
    replayExpiresAt: string;
    source: "user" | "agent" | "system";
    approvalId?: string;
    now: string;
  }): Promise<AuthorizedCommandClaimResult>;
}

export class PostgresCommandClaimStore implements CommandClaimStore {
  constructor(private readonly client: Client) {}

  async claim(input: {
    tenantId: string; jti: string; digest: string; replayExpiresAt: string;
    source: "user" | "agent" | "system"; approvalId?: string; now: string;
  }): Promise<AuthorizedCommandClaimResult> {
    await this.client.query("BEGIN");
    try {
      const replay = await this.client.query<{ request_digest: string }>(
        `INSERT INTO security_replay_claims
           (tenant_id,jti,request_digest,source,first_seen_at,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (tenant_id,jti) DO NOTHING
         RETURNING request_digest`,
        [input.tenantId,input.jti,input.digest,input.source,input.now,input.replayExpiresAt]
      );
      if (replay.rowCount !== 1) {
        const existing = await this.client.query<{ request_digest: string }>(
          "SELECT request_digest FROM security_replay_claims WHERE tenant_id=$1 AND jti=$2 FOR UPDATE",
          [input.tenantId,input.jti]
        );
        await this.client.query("ROLLBACK");
        const digest = existing.rows[0]?.request_digest;
        if (!digest) throw new Error("REPLAY_STATE_LOST");
        return digest === input.digest ? "REPLAY" : "DIGEST_CONFLICT";
      }

      if (input.approvalId) {
        const consumed = await this.client.query(
          `UPDATE security_approvals
              SET status='consumed', consumed_at=$4
            WHERE approval_id=$1
              AND tenant_id=$2
              AND request_digest=$3
              AND status='pending'
              AND expires_at>$4::timestamptz
            RETURNING approval_id`,
          [input.approvalId,input.tenantId,input.digest,input.now]
        );
        if (consumed.rowCount !== 1) {
          const approval = await this.client.query<{status:string;request_digest:string;expires_at:string}>(
            "SELECT status,request_digest,expires_at::text FROM security_approvals WHERE approval_id=$1 AND tenant_id=$2 FOR UPDATE",
            [input.approvalId,input.tenantId]
          );
          await this.client.query("ROLLBACK");
          const row = approval.rows[0];
          if (!row) return "APPROVAL_MISSING";
          if (row.request_digest !== input.digest) return "APPROVAL_DIGEST_MISMATCH";
          if (row.status === "consumed") return "APPROVAL_ALREADY_CONSUMED";
          if (Date.parse(row.expires_at) <= Date.parse(input.now)) return "APPROVAL_EXPIRED";
          return "APPROVAL_MISSING";
        }
      }

      await this.client.query("COMMIT");
      return "CLAIMED";
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }
}
