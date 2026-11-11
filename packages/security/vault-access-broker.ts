import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  authorizeDataCompartment,
  type DataCompartmentRequest,
  type DataAccessDecision
} from "./data-compartment-policy.js";

export interface CompartmentCiphertext {
  tenantId: string;
  organizationId: string | null;
  compartmentId: string;
  recordId: string;
  recordType: string;
  schemaVersion: number;
  keyVersion: number;
  kmsKeyRef: string;
  wrappedDataKey: Buffer;
  algorithm: "AES-256-GCM";
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
  aadSha256: Buffer;
  payloadSha256: Buffer;
}

export interface CompartmentCryptoProvider {
  /** KMS/HSM-backed operation. Raw DEKs and KEKs must never leave this adapter. */
  decryptRecord(input: {
    kmsKeyRef: string;
    wrappedDataKey: Buffer;
    keyVersion: number;
    algorithm: "AES-256-GCM";
    nonce: Buffer;
    ciphertext: Buffer;
    authTag: Buffer;
    aad: Buffer;
    signal?: AbortSignal;
  }): Promise<Buffer>;
}

export interface BrokerReadRequest {
  authorization: DataCompartmentRequest;
  purposeCode: string;
  correlationId?: string;
}

export type BrokerReadResult =
  | { allowed: true; recordId: string; plaintext: Buffer; keyVersion: number }
  | { allowed: false; reason: string };

function sha256(value: string | Buffer): Buffer {
  return createHash("sha256").update(value).digest();
}

function aadFor(record: CompartmentCiphertext, authorization: DataCompartmentRequest): Buffer {
  return Buffer.from(JSON.stringify({
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    moduleCode: authorization.moduleCode,
    subjectRef: authorization.subjectRef,
    compartmentId: record.compartmentId,
    recordId: record.recordId,
    recordType: record.recordType,
    schemaVersion: record.schemaVersion,
    keyVersion: record.keyVersion
  }), "utf8");
}

export class VaultAccessBroker {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: CompartmentCryptoProvider,
    private readonly cryptoTimeoutMs = 10_000
  ) {
    if (!Number.isInteger(cryptoTimeoutMs) || cryptoTimeoutMs < 1 || cryptoTimeoutMs > 60_000) {
      throw new Error("INVALID_CRYPTO_TIMEOUT");
    }
  }

  async readRecord(input: BrokerReadRequest): Promise<BrokerReadResult> {
    const request = input.authorization;
    const decision: DataAccessDecision = authorizeDataCompartment(request);
    if (!decision.allowed) return { allowed: false, reason: decision.reason };

    // Governance identity is never a data-plane identity. P059 intentionally
    // has no Admin RLS policy or Admin connection pool.
    if (request.plane === "ADMIN_CONTROL" || request.actor.kind === "privileged") {
      return { allowed: false, reason: "ADMIN_BREAKGLASS_BROKER_NOT_ENABLED" };
    }
    // Returning plaintext is a decrypt operation, not merely ciphertext read.
    if (request.requestedPermission !== "decrypt" || request.grant.permission !== "decrypt") {
      return { allowed: false, reason: "DECRYPT_PERMISSION_REQUIRED" };
    }
    if (input.purposeCode.trim() !== request.grant.purposeCode.trim()) {
      return { allowed: false, reason: "PURPOSE_MISMATCH" };
    }

    const client = await this.pool.connect();
    let encrypted: CompartmentCiphertext | null = null;
    const correlationId = input.correlationId ?? randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE tpay_data_broker_runtime");
      await client.query(
        "SELECT set_config('tpay.tenant_id',$1,true), set_config('tpay.organization_id',$2,true), set_config('tpay.actor_id',$3,true), set_config('tpay.actor_kind',$4,true), set_config('tpay.security_plane',$5,true), set_config('tpay.record_id',$6,true), set_config('tpay.compartment_id',$7,true), set_config('tpay.purpose_code',$8,true), set_config('tpay.subject_ref',$9,true), set_config('tpay.module_code',$10,true), set_config('tpay.data_class',$11,true), set_config('tpay.vault_id',$12,true), set_config('tpay.grant_id',$13,true)",
        [request.tenantId, request.organizationId ?? "", request.actor.id, request.actor.kind, request.plane, request.recordId, request.compartmentId, input.purposeCode, request.subjectRef, request.moduleCode, request.dataClass, request.vaultId, ""]
      );

      const candidate = await client.query<{ id: string }>(
        `SELECT id FROM tpay_data_record_grants
          WHERE tenant_id=$1 AND record_id=$2 AND compartment_id=$3
            AND actor_id=$4 AND actor_kind=$5
            AND permission='decrypt' AND purpose_code=$6
            AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())
            AND revoked_at IS NULL
            AND (max_uses IS NULL OR uses_count<max_uses)
          ORDER BY created_at DESC LIMIT 1`,
        [request.tenantId, request.recordId, request.compartmentId,
          request.actor.id, request.actor.kind, input.purposeCode]
      );
      const candidateGrantId = candidate.rows[0]?.id;
      if (!candidateGrantId) {
        const evidence = sha256(JSON.stringify({
          correlationId, actorId: request.actor.id, tenantId: request.tenantId,
          compartmentId: request.compartmentId, recordId: request.recordId,
          permission: "decrypt", purposeCode: input.purposeCode,
          reason: "PERSISTED_GRANT_NOT_CONSUMED"
        }));
        await client.query(
          `INSERT INTO tpay_data_access_audit
            (id,tenant_id,organization_id,compartment_id,record_id,actor_id,
             actor_kind,session_ref,permission,purpose_code,decision,reason_code,
             correlation_id,evidence_sha256)
           SELECT $1,$2,$3,c.id,$5,$6,$7,$8,'decrypt',$9,'denied',
                  'PERSISTED_GRANT_NOT_CONSUMED',$10,$11
             FROM tpay_data_compartments c
            WHERE c.tenant_id=$2 AND c.id=$4
              AND c.organization_id IS NOT DISTINCT FROM $3::text`,
          [randomUUID(), request.tenantId, request.organizationId,
            request.compartmentId, request.recordId, request.actor.id,
            request.actor.kind, request.session.id, input.purposeCode,
            correlationId, evidence]
        );
        await client.query("COMMIT");
        return { allowed: false, reason: "PERSISTED_GRANT_NOT_CONSUMED" };
      }
      await client.query("SELECT set_config('tpay.grant_id',$1,true)", [candidateGrantId]);

      const consumed = await client.query<{ grant_id: string }>(
        `UPDATE tpay_data_record_grants g
           SET uses_count = g.uses_count + 1
         WHERE g.id = $7
           AND g.tenant_id = $1
           AND g.record_id = $2
           AND g.compartment_id = $3
           AND g.actor_id = $4
           AND g.actor_kind = $5
           AND g.permission = 'decrypt'
           AND g.purpose_code = $6
           AND g.valid_from <= now()
           AND (g.valid_until IS NULL OR g.valid_until > now())
           AND g.revoked_at IS NULL
           AND (g.max_uses IS NULL OR g.uses_count < g.max_uses)
         RETURNING g.id AS grant_id`,
        [
          request.tenantId, request.recordId, request.compartmentId,
          request.actor.id, request.actor.kind, input.purposeCode, candidateGrantId
        ]
      );

      if (consumed.rowCount !== 1) {
        // Persist a denial only if the referenced compartment exists in this
        // tenant/scope; never let a forged foreign key create an audit row.
        const evidence = sha256(JSON.stringify({
          correlationId, actorId: request.actor.id, tenantId: request.tenantId,
          compartmentId: request.compartmentId, recordId: request.recordId,
          permission: "decrypt", purposeCode: input.purposeCode,
          reason: "PERSISTED_GRANT_NOT_CONSUMED"
        }));
        await client.query(
          `INSERT INTO tpay_data_access_audit
            (id,tenant_id,organization_id,compartment_id,record_id,actor_id,
             actor_kind,session_ref,permission,purpose_code,decision,reason_code,
             correlation_id,evidence_sha256)
           SELECT $1,$2,$3,c.id,$5,$6,$7,$8,'decrypt',$9,'denied',
                  'PERSISTED_GRANT_NOT_CONSUMED',$10,$11
             FROM tpay_data_compartments c
            WHERE c.tenant_id=$2 AND c.id=$4
              AND c.organization_id IS NOT DISTINCT FROM $3::text`,
          [
            randomUUID(), request.tenantId, request.organizationId,
            request.compartmentId, request.recordId, request.actor.id,
            request.actor.kind, request.session.id, input.purposeCode,
            correlationId, evidence
          ]
        );
        await client.query("COMMIT");
        return { allowed: false, reason: "PERSISTED_GRANT_NOT_CONSUMED" };
      }

      const loaded = await client.query<{
        tenant_id: string; organization_id: string | null; compartment_id: string;
        id: string; record_type: string; schema_version: number; key_version: number;
        kms_key_ref: string; wrapped_data_key: Buffer; algorithm: "AES-256-GCM";
        nonce: Buffer; ciphertext: Buffer; auth_tag: Buffer; aad_sha256: Buffer;
        payload_sha256: Buffer;
      }>(
        `SELECT r.tenant_id,r.organization_id,r.compartment_id,r.id,r.record_type,
                r.schema_version,r.key_version,k.kms_key_ref,k.wrapped_data_key,
                k.algorithm,r.nonce,r.ciphertext,r.auth_tag,r.aad_sha256,r.payload_sha256
           FROM tpay_data_records r
           JOIN tpay_data_compartment_key_versions k
             ON k.tenant_id=r.tenant_id
            AND k.compartment_id=r.compartment_id
            AND k.key_version=r.key_version
          WHERE r.tenant_id=$1 AND r.id=$2 AND r.compartment_id=$3
            AND r.record_state='active' AND k.status IN ('active','retiring')`,
        [request.tenantId, request.recordId, request.compartmentId]
      );
      const row = loaded.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "ENCRYPTED_RECORD_NOT_FOUND" };
      }

      encrypted = {
        tenantId: row.tenant_id, organizationId: row.organization_id,
        compartmentId: row.compartment_id, recordId: row.id,
        recordType: row.record_type, schemaVersion: row.schema_version,
        keyVersion: row.key_version, kmsKeyRef: row.kms_key_ref,
        wrappedDataKey: row.wrapped_data_key, algorithm: row.algorithm,
        nonce: row.nonce, ciphertext: row.ciphertext, authTag: row.auth_tag,
        aadSha256: row.aad_sha256, payloadSha256: row.payload_sha256
      };
      const aad = aadFor(encrypted, request);
      if (!sha256(aad).equals(encrypted.aadSha256)) {
        await client.query("ROLLBACK");
        return { allowed: false, reason: "AAD_CONTEXT_MISMATCH" };
      }

      // Keep the exact grant consumption, cryptographic operation, and final
      // audit decision in one database transaction. A KMS/HSM failure must
      // never leave an "allowed" audit event behind.
      const aadForAudit = aad;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.cryptoTimeoutMs);
      let plaintext: Buffer | null = null;
      let cryptoFailure: "CRYPTOGRAPHIC_DECRYPTION_FAILED" | "CRYPTOGRAPHIC_TIMEOUT" | "PAYLOAD_HASH_MISMATCH" | null = null;
      try {
        plaintext = await this.crypto.decryptRecord({
          kmsKeyRef: encrypted.kmsKeyRef,
          wrappedDataKey: encrypted.wrappedDataKey,
          keyVersion: encrypted.keyVersion,
          algorithm: encrypted.algorithm,
          nonce: encrypted.nonce,
          ciphertext: encrypted.ciphertext,
          authTag: encrypted.authTag,
          aad: aadForAudit,
          signal: controller.signal
        });
        if (!sha256(plaintext).equals(encrypted.payloadSha256)) {
          plaintext.fill(0);
          plaintext = null;
          cryptoFailure = "PAYLOAD_HASH_MISMATCH";
        }
      } catch {
        cryptoFailure = controller.signal.aborted
          ? "CRYPTOGRAPHIC_TIMEOUT"
          : "CRYPTOGRAPHIC_DECRYPTION_FAILED";
      } finally {
        clearTimeout(timeout);
      }

      const decisionEvidence = sha256(JSON.stringify({
        correlationId, actorId: request.actor.id, actorKind: request.actor.kind,
        tenantId: request.tenantId, compartmentId: request.compartmentId,
        recordId: request.recordId, permission: "decrypt",
        purposeCode: input.purposeCode, keyVersion: encrypted.keyVersion,
        outcome: cryptoFailure ?? "verified"
      }));
      await client.query(
        `INSERT INTO tpay_data_access_audit
          (id,tenant_id,organization_id,compartment_id,record_id,actor_id,
           actor_kind,session_ref,permission,purpose_code,decision,reason_code,
           correlation_id,evidence_sha256)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'decrypt',$9,$10,$11,$12,$13)`,
        [
          randomUUID(), request.tenantId, request.organizationId,
          request.compartmentId, request.recordId, request.actor.id,
          request.actor.kind, request.session.id, input.purposeCode,
          cryptoFailure ? "denied" : "allowed",
          cryptoFailure ?? "EXACT_GRANT_DECRYPTED_AND_VERIFIED",
          correlationId, decisionEvidence
        ]
      );

      // Do not release plaintext until the audit write and transaction commit
      // both succeed. A failed audit write rolls back the one-use grant too.
      await client.query("COMMIT");
      if (cryptoFailure) return { allowed: false, reason: cryptoFailure };
      if (!plaintext) return { allowed: false, reason: "CRYPTOGRAPHIC_DECRYPTION_FAILED" };
      const verifiedPlaintext = plaintext;
      plaintext = null;
      return {
        allowed: true,
        recordId: encrypted.recordId,
        plaintext: verifiedPlaintext,
        keyVersion: encrypted.keyVersion
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
