import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type PamPermission = "metadata_read" | "record_read" | "decrypt";
export type PamResource = "organization_record" | "school_record" | "financial_record" | "vault_metadata" | "vault_decrypt";
export interface PamIssueRequest {
  principalId: string;
  sessionId: string;
  sessionToken: string;
  requestId: string;
  now?: string;
}
export type PamIssueResult =
 | { allowed: true; capability: string; capabilityId: string; expiresAt: string; scope: {
   tenantId: string; organizationId: string | null; resourceType: PamResource;
   resourceRef: string; permission: PamPermission; purposeCode: string; ticketRef: string;
 } }
 | { allowed: false; reason: string };

const digest = (value: string | Buffer): Buffer => createHash("sha256").update(value).digest();
const token = (): string => randomBytes(32).toString("base64url");

/**
 * P060 PAM issuer. The returned token is an opaque one-use capability, not a
 * session and not a data-access API. A separate domain broker must validate,
 * consume and audit it before any resource operation.
 */
export class AdminPamCapabilityIssuer {
  constructor(private readonly pool: Pool) {}

  async issue(input: PamIssueRequest): Promise<PamIssueResult> {
    if (!input.sessionToken || input.sessionToken.length < 32) {
      return { allowed: false, reason: "ADMIN_SESSION_TOKEN_INVALID" };
    }
    const client = await this.pool.connect();
    const capability = token();
    const capabilityId = randomUUID();
    const correlationId = randomUUID();
    const now = input.now ?? new Date().toISOString();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE tpay_admin_pam_runtime");
      await client.query(
        "SELECT set_config('tpay.admin_principal_id',$1,true), set_config('tpay.admin_session_id',$2,true)",
        [input.principalId, input.sessionId]
      );
      await client.query("SELECT set_config('tpay.admin_request_id',$1,true)", [input.requestId]);
      const session = await client.query<{
        principal_status: string; session_id: string; session_expires_at: Date;
        assurance: string; credential_status: string; credential_id: string;
      }>(
        `SELECT p.status AS principal_status,s.id AS session_id,s.expires_at AS session_expires_at,
                s.assurance,c.status AS credential_status,c.id AS credential_id
           FROM tpay_admin_sessions s
           JOIN tpay_admin_principals p ON p.id=s.principal_id
           JOIN tpay_admin_webauthn_credentials c ON c.id=s.credential_id
          WHERE s.id=$1 AND s.principal_id=$2 AND s.token_hash=$3
            AND s.security_plane='ADMIN_CONTROL' AND s.revoked_at IS NULL
            AND s.expires_at>$4 AND p.status='active'
            AND c.status='active' AND c.revoked_at IS NULL
          FOR UPDATE OF s`,
        [input.sessionId, input.principalId, digest(input.sessionToken), now]
      );
      if (session.rowCount !== 1 || session.rows[0]?.assurance !== "hardware_key") {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "ADMIN_SESSION_INVALID_OR_INSUFFICIENT_ASSURANCE" };
      }

      const request = await client.query<{
        id: string; target_tenant_id: string; target_organization_id: string | null;
        resource_type: PamResource; resource_ref: string; requested_permission: PamPermission;
        purpose_code: string; incident_or_ticket_ref: string; status: string;
        required_approvals: number; valid_from: Date; expires_at: Date;
        requester_principal_id: string;
      }>(
        `SELECT id,target_tenant_id,target_organization_id,resource_type,resource_ref,
                requested_permission,purpose_code,incident_or_ticket_ref,status,
                required_approvals,valid_from,expires_at,requester_principal_id
           FROM tpay_admin_breakglass_requests
          WHERE id=$1 AND requester_principal_id=$2
          FOR UPDATE`,
        [input.requestId, input.principalId]
      );
      const r = request.rows[0];
      if (!r || request.rowCount !== 1) {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "BREAKGLASS_REQUEST_NOT_FOUND" };
      }
      if (r.status !== "approved") {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "BREAKGLASS_NOT_APPROVED_OR_ALREADY_USED" };
      }
      if (!r.purpose_code.trim() || !r.incident_or_ticket_ref.trim()) {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "BREAKGLASS_PURPOSE_OR_TICKET_MISSING" };
      }
      const validity = await client.query(
        "SELECT $1::timestamptz <= now() AND $2::timestamptz > now() AND $2::timestamptz <= $1::timestamptz + interval '60 minutes' AS valid",
        [r.valid_from, r.expires_at]
      );
      if (validity.rows[0]?.valid !== true) {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "BREAKGLASS_WINDOW_INVALID" };
      }
      const quorum = await client.query<{ count: string }>(
        `SELECT count(DISTINCT a.approver_principal_id)::text AS count
           FROM tpay_admin_breakglass_approvals a
           JOIN tpay_admin_sessions s ON s.id=a.session_id
           JOIN tpay_admin_principals p ON p.id=a.approver_principal_id
           JOIN tpay_admin_webauthn_credentials c ON c.id=s.credential_id
          WHERE a.request_id=$1 AND a.decision='approve'
            AND a.approver_principal_id<>$2
            AND p.status='active' AND s.assurance='hardware_key'
            AND s.revoked_at IS NULL AND s.expires_at>now()
            AND c.status='active' AND c.revoked_at IS NULL`,
        [r.id, r.requester_principal_id]
      );
      if (Number(quorum.rows[0]?.count ?? 0) < r.required_approvals) {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "BREAKGLASS_QUORUM_NOT_MET" };
      }

      const issued = await client.query(
        `INSERT INTO tpay_admin_pam_capabilities
          (id,request_id,principal_id,session_id,token_hash,target_tenant_id,
           target_organization_id,resource_type,resource_ref,permission,purpose_code,
           ticket_ref,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id,expires_at`,
        [capabilityId,r.id,input.principalId,input.sessionId,digest(capability),
         r.target_tenant_id,r.target_organization_id,r.resource_type,r.resource_ref,
         r.requested_permission,r.purpose_code,r.incident_or_ticket_ref,r.expires_at]
      );
      const issuedRow = issued.rows[0];
      if (issued.rowCount !== 1 || !issuedRow) throw new Error("PAM_CAPABILITY_NOT_ISSUED");
      const consumed = await client.query(
        "UPDATE tpay_admin_breakglass_requests SET status='consumed',consumed_at=now() WHERE id=$1 AND requester_principal_id=$2 AND status='approved'",
        [r.id,input.principalId]
      );
      if (consumed.rowCount !== 1) throw new Error("BREAKGLASS_REQUEST_CONSUMPTION_RACE");
      const evidence = digest(JSON.stringify({
        correlationId, requestId:r.id, principalId:input.principalId,
        sessionId:input.sessionId, capabilityId, tenantId:r.target_tenant_id,
        organizationId:r.target_organization_id, resourceType:r.resource_type,
        resourceRef:r.resource_ref, permission:r.requested_permission,
        purposeCode:r.purpose_code, ticketRef:r.incident_or_ticket_ref
      }));
      await client.query(
        `INSERT INTO tpay_admin_security_audit
          (id,actor_principal_id,session_id,action,target_ref,outcome,reason_code,correlation_id,evidence_sha256)
         VALUES($1,$2,$3,'pam.capability.issue',$4,'consumed','EXACT_SCOPE_QUORUM_CAPABILITY_ISSUED',$5,$6)`,
        [randomUUID(),input.principalId,input.sessionId,r.id,correlationId,evidence]
      );
      await client.query("COMMIT");
      return {
        allowed:true, capability, capabilityId,
        expiresAt:new Date(issuedRow.expires_at).toISOString(),
        scope:{tenantId:r.target_tenant_id,organizationId:r.target_organization_id,
          resourceType:r.resource_type,resourceRef:r.resource_ref,
          permission:r.requested_permission,purposeCode:r.purpose_code,ticketRef:r.incident_or_ticket_ref}
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
