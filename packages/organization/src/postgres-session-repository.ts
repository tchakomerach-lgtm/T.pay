import type { PoolClient } from "pg";
import type { OrganizationSession } from "./session-policy.js";

export interface SessionRepository {
  insert(session: OrganizationSession): Promise<void>;
  revoke(id: string, organizationId: string, userId: string, now: string): Promise<boolean>;
  findActive(id: string, organizationId: string, userId: string, now: string): Promise<OrganizationSession | undefined>;
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly db: Pick<PoolClient,"query">) {}
  async insert(s: OrganizationSession): Promise<void> {
    if (Date.parse(s.expiresAt) <= Date.parse(s.issuedAt)) throw new Error("ORG_SESSION_INVALID_EXPIRY");
    await this.db.query(
      "INSERT INTO organization_sessions (id,organization_id,user_id,role_id,issued_at,expires_at,revoked_at) VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::timestamptz)",
      [s.id,s.organizationId,s.userId,s.roleId,s.issuedAt,s.expiresAt,s.revokedAt??null]
    );
  }
  async revoke(id:string,organizationId:string,userId:string,now:string):Promise<boolean>{
    const r=await this.db.query(
      "UPDATE organization_sessions SET revoked_at=$4::timestamptz WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>$4::timestamptz",
      [id,organizationId,userId,now]
    );
    return Number(r.rowCount??0)===1;
  }
  async findActive(id:string,organizationId:string,userId:string,now:string):Promise<OrganizationSession|undefined>{
    const r=await this.db.query(
      "SELECT id,organization_id,user_id,role_id,issued_at,expires_at,revoked_at FROM organization_sessions WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND revoked_at IS NULL AND expires_at>$4::timestamptz",
      [id,organizationId,userId,now]
    );
    const x=r.rows[0]; if(!x)return undefined;
    return {id:x.id,organizationId:x.organization_id,userId:x.user_id,roleId:x.role_id,issuedAt:new Date(x.issued_at).toISOString(),expiresAt:new Date(x.expires_at).toISOString(),revokedAt:x.revoked_at?new Date(x.revoked_at).toISOString():undefined};
  }
}
