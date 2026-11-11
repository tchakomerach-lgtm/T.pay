import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { AdminWebAuthnAssertionVerifier, type WebAuthnAssertionInput } from "./admin-webauthn-assertion-verifier.js";

export type AdminSessionIssueResult =
 | { issued: true; sessionId: string; sessionToken: string; expiresAt: string; assurance: "webauthn_uv" | "hardware_key" }
 | { issued: false; reason: string };

export type AdminSessionValidation =
 | { authenticated: true; principalId: string; sessionId: string; credentialRef: string; assurance: "webauthn_uv" | "hardware_key"; expiresAt: string }
 | { authenticated: false; reason: "SESSION_INVALID" | "SESSION_EXPIRED" | "PRINCIPAL_INACTIVE" | "CREDENTIAL_REVOKED" };

export interface AdminSessionServiceOptions {
  adminOrigin: string;
  ttlSeconds?: number;
  clock?: () => Date;
}

const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest();
const opaqueToken=()=>randomBytes(32).toString("base64url");
const evidence=(value:unknown)=>digest(JSON.stringify(value));

/**
 * P062 creates Admin Control Plane sessions only from a successful P061 assertion. Hardware-key assurance requires P063 evidence and an active pinned trust root, rechecked in the session transaction and on every validation.
 */
export class AdminSessionLifecycle {
  private readonly ttlSeconds:number;
  private readonly clock:()=>Date;
  private readonly adminOrigin:string;

  constructor(private readonly pool:Pool,private readonly verifier:AdminWebAuthnAssertionVerifier,options:AdminSessionServiceOptions){
    const parsed=new URL(options.adminOrigin);
    if(parsed.protocol!=="https:" || parsed.pathname!=="/" || parsed.search || parsed.hash){
      throw new Error("ADMIN_ORIGIN_MUST_BE_HTTPS_ORIGIN");
    }
    this.adminOrigin=parsed.origin;
    this.ttlSeconds=options.ttlSeconds ?? 900;
    if(!Number.isInteger(this.ttlSeconds) || this.ttlSeconds<60 || this.ttlSeconds>900){
      throw new Error("ADMIN_SESSION_TTL_MUST_BE_60_TO_900_SECONDS");
    }
    this.clock=options.clock ?? (()=>new Date());
  }

  async issueFromAssertion(input:WebAuthnAssertionInput):Promise<AdminSessionIssueResult>{
    const assertion=await this.verifier.verifyAuthentication(input);
    if(!assertion.verified) return {issued:false,reason:`WEBAUTHN_${assertion.reason}`};

    const client=await this.pool.connect();
    const sessionId=randomUUID();
    const sessionToken=opaqueToken();
    const correlationId=randomUUID();
    const now=this.clock();
    try{
      await client.query("BEGIN");
      const principal=await client.query<{
        status:string;assurance_floor:string;
      }>(
        `SELECT status,assurance_floor FROM tpay_admin_principals
          WHERE id=$1 FOR UPDATE`,[assertion.principalId]
      );
      if(principal.rowCount!==1 || principal.rows[0]?.status!=="active"){
        await client.query("ROLLBACK");
        return {issued:false,reason:"ADMIN_PRINCIPAL_INACTIVE"};
      }
      const floor=principal.rows[0]?.assurance_floor;
      if(floor==="hardware_key" && assertion.assurance!=="hardware_key"){
        await client.query("ROLLBACK");
        return {issued:false,reason:"HARDWARE_ATTESTATION_REQUIRED"};
      }
      const credential=await client.query<{
        id:string;hardware_attested:boolean;attestation_root_fingerprint:string|null;
      }>(
        `SELECT id,hardware_attested,attestation_root_fingerprint
           FROM tpay_admin_webauthn_credentials
          WHERE id=$1 AND principal_id=$2 AND status='active' AND revoked_at IS NULL
          FOR UPDATE`,[assertion.credentialRef,assertion.principalId]
      );
      if(credential.rowCount!==1 || !credential.rows[0]){
        await client.query("ROLLBACK");
        return {issued:false,reason:"WEBAUTHN_CREDENTIAL_REVOKED"};
      }
      if(assertion.assurance==="hardware_key"){
        if(!credential.rows[0].hardware_attested || !credential.rows[0].attestation_root_fingerprint){
          await client.query("ROLLBACK");
          return {issued:false,reason:"HARDWARE_ATTESTATION_REQUIRED"};
        }
        const root=await client.query(
          `SELECT fingerprint_sha256 FROM tpay_admin_webauthn_attestation_roots
            WHERE fingerprint_sha256=$1 AND status='active' FOR SHARE`,
          [credential.rows[0].attestation_root_fingerprint]
        );
        if(root.rowCount!==1){
          await client.query("ROLLBACK");
          return {issued:false,reason:"HARDWARE_ATTESTATION_REVOKED"};
        }
      }
      const expiresAt=new Date(now.getTime()+this.ttlSeconds*1000);
      await client.query(
        `INSERT INTO tpay_admin_sessions
          (id,principal_id,credential_id,token_hash,security_plane,assurance,origin,created_at,last_seen_at,expires_at)
         VALUES($1,$2,$3,$4,'ADMIN_CONTROL','${assertion.assurance}',$5,$6,$6,$7)`,
        [sessionId,assertion.principalId,assertion.credentialRef,digest(sessionToken),this.adminOrigin,now,expiresAt]
      );
      await client.query(
        `INSERT INTO tpay_admin_security_audit
          (id,actor_principal_id,session_id,action,target_ref,outcome,reason_code,correlation_id,evidence_sha256)
         VALUES($1,$2,$3,'admin.session.issued',$3,'created','WEBAUTHN_ASSERTION_VERIFIED',$4,$5)`,
        [randomUUID(),assertion.principalId,sessionId,correlationId,evidence({
          principalId:assertion.principalId,credentialRef:assertion.credentialRef,
          sessionId,origin:this.adminOrigin,assurance:assertion.assurance,expiresAt:expiresAt.toISOString()
        })]
      );
      await client.query("COMMIT");
      return {issued:true,sessionId,sessionToken,expiresAt:expiresAt.toISOString(),assurance:assertion.assurance};
    }catch(error){
      await client.query("ROLLBACK").catch(()=>undefined);
      throw error;
    }finally{
      client.release();
    }
  }

  async validate(sessionToken:string):Promise<AdminSessionValidation>{
    if(!sessionToken || sessionToken.length<32) return {authenticated:false,reason:"SESSION_INVALID"};
    const result=await this.pool.query<{
      principal_id:string;session_id:string;credential_id:string;assurance:string;
      expires_at:Date;principal_status:string;credential_status:string;credential_revoked_at:Date|null;hardware_attested:boolean;attestation_root_fingerprint:string|null;root_status:string|null;
      session_revoked_at:Date|null;origin:string;
    }>(
      `SELECT s.principal_id,s.id AS session_id,s.credential_id,s.assurance,s.expires_at,
              p.status AS principal_status,c.status AS credential_status,c.revoked_at AS credential_revoked_at,
              c.hardware_attested,c.attestation_root_fingerprint,r.status AS root_status,
              s.revoked_at AS session_revoked_at,s.origin
         FROM tpay_admin_sessions s
         JOIN tpay_admin_principals p ON p.id=s.principal_id
         JOIN tpay_admin_webauthn_credentials c ON c.id=s.credential_id
         LEFT JOIN tpay_admin_webauthn_attestation_roots r
           ON r.fingerprint_sha256=c.attestation_root_fingerprint
        WHERE s.token_hash=$1 AND s.security_plane='ADMIN_CONTROL'`,
      [digest(sessionToken)]
    );
    const row=result.rows[0];
    if(result.rowCount!==1 || !row) return {authenticated:false,reason:"SESSION_INVALID"};
    if(row.session_revoked_at || row.origin!==this.adminOrigin) return {authenticated:false,reason:"SESSION_INVALID"};
    if(row.expires_at<=this.clock()) return {authenticated:false,reason:"SESSION_EXPIRED"};
    if(row.principal_status!=="active") return {authenticated:false,reason:"PRINCIPAL_INACTIVE"};
    if(row.credential_status!=="active" || row.credential_revoked_at) return {authenticated:false,reason:"CREDENTIAL_REVOKED"};
    if(row.assurance!=="webauthn_uv" && row.assurance!=="hardware_key") return {authenticated:false,reason:"SESSION_INVALID"};
    if(row.assurance==="hardware_key" && (!row.hardware_attested || !row.attestation_root_fingerprint || row.root_status!=="active"))
      return {authenticated:false,reason:"CREDENTIAL_REVOKED"};
    // Touch is deliberately best-effort and does not extend the fixed expiry.
    await this.pool.query(
      `UPDATE tpay_admin_sessions SET last_seen_at=now()
        WHERE id=$1 AND revoked_at IS NULL AND last_seen_at<now()-interval '60 seconds'`,
      [row.session_id]
    );
    return {authenticated:true,principalId:row.principal_id,sessionId:row.session_id,
      credentialRef:row.credential_id,assurance:row.assurance as "webauthn_uv"|"hardware_key",expiresAt:row.expires_at.toISOString()};
  }

  async revoke(sessionToken:string,reason:string):Promise<{revoked:boolean;reason?:string}>{
    if(!sessionToken || sessionToken.length<32) return {revoked:false,reason:"SESSION_INVALID"};
    if(!reason.trim() || reason.trim().length>256) return {revoked:false,reason:"REVOCATION_REASON_REQUIRED"};
    const client=await this.pool.connect();
    try{
      await client.query("BEGIN");
      const found=await client.query<{id:string;principal_id:string}>(
        `SELECT id,principal_id FROM tpay_admin_sessions
          WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()
          FOR UPDATE`,[digest(sessionToken)]
      );
      const row=found.rows[0];
      if(found.rowCount!==1 || !row){
        await client.query("ROLLBACK");
        return {revoked:false,reason:"SESSION_INVALID"};
      }
      await client.query(
        "UPDATE tpay_admin_sessions SET revoked_at=now(),revoke_reason=$2 WHERE id=$1 AND revoked_at IS NULL",
        [row.id,reason.trim()]
      );
      await client.query(
        `INSERT INTO tpay_admin_security_audit
          (id,actor_principal_id,session_id,action,target_ref,outcome,reason_code,correlation_id,evidence_sha256)
         VALUES($1,$2,$3,'admin.session.revoked',$3,'revoked','SESSION_SELF_REVOCATION',$4,$5)`,
        [randomUUID(),row.principal_id,row.id,randomUUID(),evidence({sessionId:row.id,reason:reason.trim()})]
      );
      await client.query("COMMIT");
      return {revoked:true};
    }catch(error){
      await client.query("ROLLBACK").catch(()=>undefined);
      throw error;
    }finally{
      client.release();
    }
  }
}
