import {
  createHash,
  createPublicKey,
  randomUUID,
  verify as cryptoVerify,
  type JsonWebKey,
} from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type WebAuthnFailure =
  | "CHALLENGE_INVALID_OR_EXPIRED"
  | "CREDENTIAL_NOT_FOUND_OR_REVOKED"
  | "CLIENT_DATA_INVALID"
  | "ORIGIN_OR_RP_ID_MISMATCH"
  | "USER_PRESENCE_REQUIRED"
  | "USER_VERIFICATION_REQUIRED"
  | "AUTHENTICATOR_DATA_INVALID"
  | "SIGNATURE_INVALID"
  | "SIGN_COUNTER_REPLAY"
  | "ASSERTION_REPLAY";

export type WebAuthnAssertionInput = {
  principalId: string;
  challengeId: string;
  credentialId: string; // base64url
  clientDataJSON: string; // base64url
  authenticatorData: string; // base64url
  signature: string; // base64url
  now?: Date;
};

export type WebAuthnAssertionResult =
  | { verified: true; principalId: string; credentialRef: string; assurance: "webauthn_uv" | "hardware_key"; signCount: number }
  | { verified: false; reason: WebAuthnFailure };

type Cbor = null | boolean | number | string | Buffer | Cbor[] | Map<Cbor, Cbor>;
class CborReader {
  private offset = 0;
  constructor(private readonly bytes: Buffer) {}
  read(): Cbor {
    const initial = this.byte();
    const major = initial >> 5;
    const additional = initial & 31;
    const length = this.length(additional);
    if (major === 0) return length;
    if (major === 1) return -1 - length;
    if (major === 2) return this.take(length);
    if (major === 3) return this.take(length).toString("utf8");
    if (major === 4) return Array.from({ length }, () => this.read());
    if (major === 5) {
      const result = new Map<Cbor, Cbor>();
      for (let i = 0; i < length; i++) result.set(this.read(), this.read());
      return result;
    }
    if (major === 7 && additional === 20) return false;
    if (major === 7 && additional === 21) return true;
    if (major === 7 && additional === 22) return null;
    throw new Error("WEBAUTHN_COSE_CBOR_UNSUPPORTED");
  }
  private byte(): number {
    if (this.offset >= this.bytes.length) throw new Error("WEBAUTHN_COSE_CBOR_TRUNCATED");
    return this.bytes[this.offset++]!;
  }
  private take(n: number): Buffer {
    if (!Number.isSafeInteger(n) || n < 0 || this.offset + n > this.bytes.length) {
      throw new Error("WEBAUTHN_COSE_CBOR_TRUNCATED");
    }
    const out = this.bytes.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }
  private length(additional: number): number {
    if (additional < 24) return additional;
    if (additional === 24) return this.byte();
    if (additional === 25) return (this.byte() << 8) | this.byte();
    if (additional === 26) return this.byte() * 0x1000000 + (this.byte() << 16) + (this.byte() << 8) + this.byte();
    throw new Error("WEBAUTHN_COSE_CBOR_LENGTH_UNSUPPORTED");
  }
}

function cosePublicKey(encoded: Buffer): { key: ReturnType<typeof createPublicKey>; algorithm: "ES256" | "RS256" | "EdDSA" } {
  const decoded = new CborReader(encoded).read();
  if (!(decoded instanceof Map)) throw new Error("WEBAUTHN_COSE_KEY_INVALID");
  const get = (key: number): Cbor | undefined => decoded.get(key);
  const asBuffer = (v: Cbor | undefined): Buffer => {
    if (!Buffer.isBuffer(v)) throw new Error("WEBAUTHN_COSE_KEY_INVALID");
    return v;
  };
  const asNumber = (v: Cbor | undefined): number => {
    if (typeof v !== "number") throw new Error("WEBAUTHN_COSE_KEY_INVALID");
    return v;
  };
  const kty = asNumber(get(1));
  const alg = asNumber(get(3));
  if (kty === 2 && alg === -7 && asNumber(get(-1)) === 1) {
    const x = asBuffer(get(-2)).toString("base64url");
    const y = asBuffer(get(-3)).toString("base64url");
    const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x, y };
    return { key: createPublicKey({ key: jwk, format: "jwk" }), algorithm: "ES256" };
  }
  if (kty === 3 && alg === -257) {
    const n = asBuffer(get(-1)).toString("base64url");
    const e = asBuffer(get(-2)).toString("base64url");
    const jwk: JsonWebKey = { kty: "RSA", n, e };
    return { key: createPublicKey({ key: jwk, format: "jwk" }), algorithm: "RS256" };
  }
  if (kty === 1 && alg === -8 && asNumber(get(-1)) === 6) {
    const x = asBuffer(get(-2)).toString("base64url");
    const jwk: JsonWebKey = { kty: "OKP", crv: "Ed25519", x };
    return { key: createPublicKey({ key: jwk, format: "jwk" }), algorithm: "EdDSA" };
  }
  throw new Error("WEBAUTHN_COSE_ALGORITHM_NOT_ALLOWED");
}

const sha256 = (value: Buffer | string): Buffer => createHash("sha256").update(value).digest();
const decode = (value: string): Buffer => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("WEBAUTHN_BASE64URL_INVALID");
  return Buffer.from(value, "base64url");
};
const deny = (reason: WebAuthnFailure): WebAuthnAssertionResult => ({ verified: false, reason });

export class AdminWebAuthnAssertionVerifier {
  constructor(private readonly pool: Pool) {}

  async verifyAuthentication(input: WebAuthnAssertionInput): Promise<WebAuthnAssertionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const challenge = await client.query<{
        challenge_hash: Buffer; expected_origin: string; expected_rp_id: string;
        expires_at: Date; consumed_at: Date | null;
      }>(
        `SELECT challenge_hash,expected_origin,expected_rp_id,expires_at,consumed_at
           FROM tpay_admin_webauthn_challenges
          WHERE id=$1 AND principal_id=$2 AND purpose='authentication'
          FOR UPDATE`,
        [input.challengeId, input.principalId]
      );
      const ch = challenge.rows[0];
      if (!ch || challenge.rowCount !== 1 || ch.consumed_at || ch.expires_at <= (input.now ?? new Date())) {
        await client.query("ROLLBACK");
        return deny("CHALLENGE_INVALID_OR_EXPIRED");
      }

      let credentialId: Buffer, clientDataBytes: Buffer, authData: Buffer, signature: Buffer;
      let clientData: { type?: string; challenge?: string; origin?: string; crossOrigin?: boolean };
      try {
        credentialId = decode(input.credentialId);
        clientDataBytes = decode(input.clientDataJSON);
        authData = decode(input.authenticatorData);
        signature = decode(input.signature);
        clientData = JSON.parse(clientDataBytes.toString("utf8"));
      } catch {
        await client.query("ROLLBACK");
        return deny("CLIENT_DATA_INVALID");
      }
      let challengeBytes: Buffer;
      try {
        if (!clientData.challenge) throw new Error("WEBAUTHN_CHALLENGE_MISSING");
        challengeBytes = decode(clientData.challenge);
      } catch {
        await client.query("ROLLBACK");
        return deny("CLIENT_DATA_INVALID");
      }
      if (clientData.type !== "webauthn.get" || clientData.crossOrigin === true ||
          clientData.origin !== ch.expected_origin ||
          !sha256(challengeBytes).equals(ch.challenge_hash)) {
        await client.query("ROLLBACK");
        return deny("ORIGIN_OR_RP_ID_MISMATCH");
      }
      if (authData.length < 37) {
        await client.query("ROLLBACK");
        return deny("AUTHENTICATOR_DATA_INVALID");
      }
      if (!authData.subarray(0, 32).equals(sha256(ch.expected_rp_id))) {
        await client.query("ROLLBACK");
        return deny("ORIGIN_OR_RP_ID_MISMATCH");
      }
      const flags = authData[32]!;
      if ((flags & 0x01) === 0) {
        await client.query("ROLLBACK");
        return deny("USER_PRESENCE_REQUIRED");
      }
      if ((flags & 0x04) === 0) {
        await client.query("ROLLBACK");
        return deny("USER_VERIFICATION_REQUIRED");
      }
      const newCounter = authData.readUInt32BE(33);
      const credential = await client.query<{
        id: string; public_key_cose: Buffer; sign_count: string | number;
        status: string; revoked_at: Date | null; hardware_attested: boolean;
        attestation_root_fingerprint: string | null; root_status: string | null;
      }>(
        `SELECT c.id,c.public_key_cose,c.sign_count,c.status,c.revoked_at,
                c.hardware_attested,c.attestation_root_fingerprint,r.status AS root_status
           FROM tpay_admin_webauthn_credentials c
           LEFT JOIN tpay_admin_webauthn_attestation_roots r
             ON r.fingerprint_sha256=c.attestation_root_fingerprint
          WHERE c.principal_id=$1 AND c.credential_id=$2
          FOR UPDATE OF c`,
        [input.principalId, credentialId]
      );
      const cred = credential.rows[0];
      if (!cred || credential.rowCount !== 1 || cred.status !== "active" || cred.revoked_at) {
        await client.query("ROLLBACK");
        return deny("CREDENTIAL_NOT_FOUND_OR_REVOKED");
      }
      if (cred.hardware_attested && (!cred.attestation_root_fingerprint || cred.root_status !== "active")) {
        await client.query("ROLLBACK");
        return deny("CREDENTIAL_NOT_FOUND_OR_REVOKED");
      }
      const oldCounter = Number(cred.sign_count);
      let publicKey: ReturnType<typeof createPublicKey>;
      let algorithm: "ES256" | "RS256" | "EdDSA";
      try {
        ({ key: publicKey, algorithm } = cosePublicKey(cred.public_key_cose));
      } catch {
        await client.query("ROLLBACK");
        return deny("CREDENTIAL_NOT_FOUND_OR_REVOKED");
      }
      const signedBytes = Buffer.concat([authData, sha256(clientDataBytes)]);
      const verified = algorithm === "EdDSA"
        ? cryptoVerify(null, signedBytes, publicKey, signature)
        : cryptoVerify("sha256", signedBytes, publicKey, signature);
      if (!verified) {
        await client.query("ROLLBACK");
        return deny("SIGNATURE_INVALID");
      }
      // A counter anomaly is actionable only after the assertion's signature is valid;
      // otherwise an unauthenticated caller could disable another Admin's credential.
      if (oldCounter > 0 && newCounter > 0 && newCounter <= oldCounter) {
        await client.query(
          "UPDATE tpay_admin_webauthn_credentials SET status='suspect' WHERE id=$1 AND status='active'",
          [cred.id]
        );
        const evidence = sha256(Buffer.concat([authData, sha256(clientDataBytes), signature]));
        await client.query(
          `INSERT INTO tpay_admin_security_audit
            (id,actor_principal_id,session_id,action,target_ref,outcome,reason_code,correlation_id,evidence_sha256)
           VALUES($1,$2,NULL,'webauthn.sign_counter_replay',$3,'denied','VALID_SIGNATURE_COUNTER_NOT_MONOTONIC',$4,$5)`,
          [randomUUID(),input.principalId,cred.id,randomUUID(),evidence]
        );
        await client.query("COMMIT");
        return deny("SIGN_COUNTER_REPLAY");
      }
      const consumed = await client.query(
        `UPDATE tpay_admin_webauthn_challenges SET consumed_at=now()
          WHERE id=$1 AND consumed_at IS NULL AND expires_at>now()`,
        [input.challengeId]
      );
      if (consumed.rowCount !== 1) {
        await client.query("ROLLBACK");
        return deny("ASSERTION_REPLAY");
      }
      const updated = await client.query(
        `UPDATE tpay_admin_webauthn_credentials
            SET sign_count=GREATEST(sign_count,$2),last_used_at=now()
          WHERE id=$1 AND status='active' AND revoked_at IS NULL`,
        [cred.id, newCounter]
      );
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return deny("CREDENTIAL_NOT_FOUND_OR_REVOKED");
      }
      await client.query("COMMIT");
      return { verified: true, principalId: input.principalId, credentialRef: cred.id,
        assurance: cred.hardware_attested ? "hardware_key" : "webauthn_uv", signCount: newCounter };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
