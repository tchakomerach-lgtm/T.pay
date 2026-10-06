import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { generateOpaqueToken, hashPassword, hashSecret, normalizeLoginIdentifier, sha256Hex, verifyPassword, verifySecret } from "./crypto.js";

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  organizationId?: string;
  csrfToken: string;
  expiresAt: string;
  assurance: "standard" | "step_up";
}

export interface RegistrationResult {
  userId: string;
  session: AuthenticatedSession;
  sessionToken: string;
}

export interface IdentityConfig {
  sessionTtlMs?: number;
  lockoutAfterFailures?: number;
  lockoutMs?: number;
}

const defaults = { sessionTtlMs: 8 * 60 * 60 * 1000, lockoutAfterFailures: 5, lockoutMs: 15 * 60 * 1000 };
const dummyPasswordHash = hashPassword("tpay-dummy-password-timing-v1");

async function withTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function sessionResult(row: any, csrfToken: string): AuthenticatedSession {
  return {
    sessionId: row.id,
    userId: row.user_id,
    ...(row.organization_id ? { organizationId: row.organization_id } : {}),
    csrfToken,
    expiresAt: new Date(row.expires_at).toISOString(),
    assurance: row.assurance
  };
}

async function createSession(client: PoolClient, userId: string, config: Required<IdentityConfig>, organizationId?: string, rotatedFromId?: string): Promise<{ session: AuthenticatedSession; sessionToken: string }> {
  const sessionId = randomUUID();
  const token = generateOpaqueToken(32);
  const csrfToken = generateOpaqueToken(32);
  const expires = new Date(Date.now() + config.sessionTtlMs);
  await client.query(
    `INSERT INTO identity_sessions(id,user_id,organization_id,token_hash,csrf_hash,expires_at,rotated_from_id)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [sessionId,userId,organizationId ?? null,sha256Hex(token),sha256Hex(csrfToken),expires,rotatedFromId ?? null]
  );
  return {
    session: { sessionId, userId, ...(organizationId ? {organizationId} : {}), csrfToken, expiresAt: expires.toISOString(), assurance:"standard" },
    token
  };
}

export async function registerWithPassword(
  pool: Pool,
  input: { loginIdentifier: string; displayName: string; password: string },
  config: IdentityConfig = {}
): Promise<RegistrationResult> {
  const cfg = { ...defaults, ...config };
  const login = normalizeLoginIdentifier(input.loginIdentifier);
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 160) throw new Error("INVALID_DISPLAY_NAME");
  const passwordHash = await hashPassword(input.password);
  return withTx(pool, async client => {
    const userId = randomUUID();
    try {
      await client.query("INSERT INTO users(id,login_identifier,display_name) VALUES($1,$2,$3)",[userId,login,displayName]);
    } catch (error:any) {
      if (error?.code === "23505") throw new Error("REGISTRATION_UNAVAILABLE");
      throw error;
    }
    await client.query(
      "INSERT INTO identity_credentials(id,user_id,kind,secret_hash) VALUES($1,$2,'password',$3)",
      [randomUUID(),userId,passwordHash]
    );
    const created = await createSession(client,userId,cfg);
    return { userId, session: created.session, sessionToken: created.sessionToken };
  });
}

export async function loginWithPassword(
  pool: Pool,
  input: { loginIdentifier: string; password: string },
  config: IdentityConfig = {}
): Promise<RegistrationResult> {
  const cfg = { ...defaults, ...config };
  const login = normalizeLoginIdentifier(input.loginIdentifier);
  return withTx(pool, async client => {
    const result = await client.query(
      `SELECT u.id AS user_id,u.status,c.id AS credential_id,c.status AS credential_status,
              c.secret_hash,c.failed_attempts,c.locked_until
         FROM users u JOIN identity_credentials c ON c.user_id=u.id
        WHERE u.login_identifier=$1 AND c.kind='password'
        FOR UPDATE`, [login]
    );
    const row = result.rows[0];
    const usable = !!row && row.status === "active" && row.credential_status === "active" &&
      !(row.locked_until && new Date(row.locked_until).getTime() > Date.now());
    if (!usable) {
      await verifyPassword(input.password, await dummyPasswordHash);
      throw new Error("AUTHENTICATION_FAILED");
    }
    const valid = await verifyPassword(input.password,row.secret_hash);
    if (!valid) {
      const failures = row.failed_attempts + 1;
      const locked = failures >= cfg.lockoutAfterFailures ? new Date(Date.now()+cfg.lockoutMs) : null;
      await client.query("UPDATE identity_credentials SET failed_attempts=$2,locked_until=$3 WHERE id=$1",[row.credential_id,failures,locked]);
      throw new Error("AUTHENTICATION_FAILED");
    }
    await client.query("UPDATE identity_credentials SET failed_attempts=0,locked_until=NULL WHERE id=$1",[row.credential_id]);
    const created = await createSession(client,row.user_id,cfg);
    return { userId: row.user_id, session: created.session, sessionToken: created.sessionToken };
  });
}

export async function resolveSession(pool: Pool, token: string): Promise<AuthenticatedSession> {
  const hash = sha256Hex(token);
  const result = await pool.query(
    `SELECT id,user_id,organization_id,csrf_hash,expires_at,assurance
       FROM identity_sessions
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()`, [hash]
  );
  const row = result.rows[0];
  if (!row) throw new Error("SESSION_INVALID");
  return sessionResult(row, "");
}

export async function rotateSession(pool: Pool, token: string): Promise<{ session: AuthenticatedSession; sessionToken: string }> {
  return withTx(pool, async client => {
    const result = await client.query(
      `SELECT id,user_id,organization_id,expires_at,assurance
         FROM identity_sessions
        WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()
        FOR UPDATE`, [sha256Hex(token)]
    );
    const row = result.rows[0];
    if (!row) throw new Error("SESSION_INVALID");
    await client.query("UPDATE identity_sessions SET revoked_at=now() WHERE id=$1",[row.id]);
    const created = await createSession(client,row.user_id,{...defaults},row.organization_id,row.id);
    return created;
  });
}

export async function logout(pool: Pool, token: string): Promise<void> {
  await pool.query("UPDATE identity_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",[sha256Hex(token)]);
}

export async function createOrganizationWithFounder(
  pool: Pool,
  input: { founderId: string; name: string; type: string; accessCode: string }
): Promise<{ organizationId: string; roleId: string }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 160) throw new Error("INVALID_ORGANIZATION_NAME");
  if (input.accessCode.length < 8 || input.accessCode.length > 128) throw new Error("INVALID_ORGANIZATION_ACCESS_CODE");
  return withTx(pool, async client => {
    const founder = await client.query("SELECT id FROM users WHERE id=$1 AND status='active' FOR SHARE",[input.founderId]);
    if (!founder.rowCount) throw new Error("USER_NOT_ACTIVE");
    const organizationId = randomUUID();
    const roleId = randomUUID();
    await client.query(
      "INSERT INTO organizations(id,name,type,founder_id,access_code_hash) VALUES($1,$2,$3,$4,$5)",
      [organizationId,name,input.type,input.founderId,await hashSecret(input.accessCode)]
    );
    await client.query(
      "INSERT INTO organization_roles(id,organization_id,name,permissions) VALUES($1,$2,'Fondateur',$3)",
      [roleId,organizationId,["org.read","org.manage","member.manage","finance.read","finance.initiate","finance.approve","ledger.read","audit.read","security.manage"]]
    );
    await client.query(
      "INSERT INTO organization_memberships(organization_id,user_id,role_id) VALUES($1,$2,$3)",
      [organizationId,input.founderId,roleId]
    );
    return { organizationId, roleId };
  });
}

export async function openOrganizationSession(
  pool: Pool,
  input: { sessionToken: string; organizationId: string; accessCode: string },
  config: { lockoutAfterFailures?: number; lockoutMs?: number } = {}
): Promise<AuthenticatedSession> {
  const threshold = config.lockoutAfterFailures ?? 5;
  const lockoutMs = config.lockoutMs ?? 15 * 60 * 1000;
  return withTx(pool, async client => {
    const sessionLookup = await client.query(
      `SELECT id,user_id,organization_id,csrf_hash,expires_at,assurance
         FROM identity_sessions
        WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [sha256Hex(input.sessionToken)]
    );
    const session = sessionLookup.rows[0];
    if (!session) throw new Error("SESSION_INVALID");

    const membership = await client.query(
      `SELECT m.status
         FROM organization_memberships m
        WHERE m.organization_id=$1 AND m.user_id=$2
        FOR SHARE`,
      [input.organizationId, session.user_id]
    );
    if (!membership.rows[0] || membership.rows[0].status !== "active") {
      throw new Error("ORGANIZATION_ACCESS_DENIED");
    }

    const organization = await client.query(
      `SELECT access_code_hash,failed_access_attempts,access_locked_until,status
         FROM organizations
        WHERE id=$1
        FOR UPDATE`,
      [input.organizationId]
    );
    const row = organization.rows[0];
    if (!row || row.status !== "active" || (row.access_locked_until && new Date(row.access_locked_until).getTime() > Date.now())) {
      throw new Error("ORGANIZATION_ACCESS_DENIED");
    }

    if (!(await verifySecret(input.accessCode, row.access_code_hash))) {
      const failures = row.failed_access_attempts + 1;
      const locked = failures >= threshold ? new Date(Date.now() + lockoutMs) : null;
      await client.query(
        "UPDATE organizations SET failed_access_attempts=$2,access_locked_until=$3 WHERE id=$1",
        [input.organizationId, failures, locked]
      );
      throw new Error("ORGANIZATION_ACCESS_DENIED");
    }

    await client.query(
      "UPDATE organizations SET failed_access_attempts=0,access_locked_until=NULL WHERE id=$1",
      [input.organizationId]
    );
    await client.query(
      "UPDATE identity_sessions SET organization_id=$2 WHERE id=$1",
      [session.id, input.organizationId]
    );
    return sessionResult({ ...session, organization_id: input.organizationId }, "");
  });
}

export async function rotateCsrfToken(pool: Pool, sessionToken: string): Promise<string> {
  const csrfToken = generateOpaqueToken(32);
  const result = await pool.query(
    `UPDATE identity_sessions
        SET csrf_hash=$2,last_seen_at=now()
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()
      RETURNING id`,
    [sha256Hex(sessionToken), sha256Hex(csrfToken)]
  );
  if (!result.rowCount) throw new Error("SESSION_INVALID");
  return csrfToken;
}

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  if (!token) throw new Error("SESSION_TOKEN_REQUIRED");
  return `__Host-tpay_session=${token}; Max-Age=${Math.max(1,Math.floor(maxAgeSeconds))}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function assertCsrf(requestOrigin: string | undefined, expectedOrigin: string, csrfHeader: string | undefined, storedCsrfHash: string | undefined): void {
  if (!requestOrigin || requestOrigin !== expectedOrigin) throw new Error("CSRF_ORIGIN_REJECTED");
  if (!csrfHeader || !storedCsrfHash || csrfHeader.length < 32 || !/^[a-f0-9]{64}$/.test(storedCsrfHash)) {
    throw new Error("CSRF_TOKEN_REJECTED");
  }
  const presentedHash = Buffer.from(sha256Hex(csrfHeader), "utf8");
  const expectedHash = Buffer.from(storedCsrfHash, "utf8");
  if (presentedHash.length !== expectedHash.length || !timingSafeEqual(presentedHash, expectedHash)) {
    throw new Error("CSRF_TOKEN_REJECTED");
  }
}

export interface OrganizationMemberRecord {
  userId:string; displayName:string; loginIdentifier:string; roleId:string; roleName:string; permissions:string[]; status:"active"|"suspended"|"revoked";
}
export async function listOrganizationMembers(pool:Pool, organizationId:string, actorUserId:string):Promise<OrganizationMemberRecord[]>{
  const access=await pool.query(`SELECT 1 FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='active'`,[organizationId,actorUserId]);
  if(!access.rowCount)throw new Error("ORGANIZATION_ACCESS_DENIED");
  const result=await pool.query(`SELECT u.id AS user_id,u.display_name,u.login_identifier,m.role_id,r.name AS role_name,r.permissions,m.status
    FROM organization_memberships m JOIN users u ON u.id=m.user_id JOIN organization_roles r ON r.id=m.role_id
    WHERE m.organization_id=$1 ORDER BY u.display_name ASC`,[organizationId]);
  return result.rows.map(row=>({userId:String(row.user_id),displayName:String(row.display_name),loginIdentifier:String(row.login_identifier),roleId:String(row.role_id),roleName:String(row.role_name),permissions:Array.isArray(row.permissions)?row.permissions.map(String):[],status:String(row.status) as OrganizationMemberRecord["status"]}));
}
export async function createOrganizationRole(pool:Pool,input:{organizationId:string;actorUserId:string;name:string;permissions:string[]}):Promise<{roleId:string}>{
  const name=input.name.trim();
  if(name.length<2||name.length>100)throw new Error("INVALID_ROLE_NAME");
  const permissions=normalizePermissions(input.permissions);
  return withTx(pool,async client=>{
    const actor=await client.query(`SELECT r.permissions FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' FOR SHARE`,[input.organizationId,input.actorUserId]);
    const allowed=actor.rows[0]?.permissions?.includes("member.manage");
    if(!allowed)throw new Error("PERMISSION_DENIED");
    const roleId=randomUUID();
    await client.query("INSERT INTO organization_roles(id,organization_id,name,permissions) VALUES($1,$2,$3,$4)",[roleId,input.organizationId,name,permissions]);
    await auditOrganizationChange(client,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"role.created",targetType:"role",targetId:roleId,metadata:{name,permissions}});
    return {roleId};
  });
}
export async function updateOrganizationRole(pool:Pool,input:{organizationId:string;actorUserId:string;roleId:string;name:string;permissions:string[]}):Promise<void>{
  const name=input.name.trim();
  if(name.length<2||name.length>100)throw new Error("INVALID_ROLE_NAME");
  const permissions=[...new Set(input.permissions.map(p=>p.trim()).filter(Boolean))].slice(0,100);
  const actor=await pool.query(`SELECT r.permissions FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'`,[input.organizationId,input.actorUserId]);
  if(!actor.rows[0]?.permissions?.includes("member.manage"))throw new Error("PERMISSION_DENIED");
  const result=await pool.query("UPDATE organization_roles SET name=$3,permissions=$4 WHERE organization_id=$1 AND id=$2",[input.organizationId,input.roleId,name,permissions]);
  if(!result.rowCount)throw new Error("ROLE_NOT_FOUND");
  await pool.query("INSERT INTO organization_audit_events(id,organization_id,actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",[randomUUID(),input.organizationId,input.actorUserId,"role.updated","role",input.roleId,JSON.stringify({name,permissions})]);
}
export async function setOrganizationMemberRole(pool:Pool,input:{organizationId:string;actorUserId:string;userId:string;roleId:string}):Promise<void>{
  return withTx(pool,async client=>{
    const actor=await client.query(`SELECT r.permissions FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' FOR SHARE`,[input.organizationId,input.actorUserId]);
    if(!actor.rows[0]?.permissions?.includes("member.manage"))throw new Error("PERMISSION_DENIED");
    const role=await client.query("SELECT id FROM organization_roles WHERE organization_id=$1 AND id=$2",[input.organizationId,input.roleId]);
    if(!role.rowCount)throw new Error("ROLE_NOT_FOUND");
    const result=await client.query("UPDATE organization_memberships SET role_id=$3 WHERE organization_id=$1 AND user_id=$2 AND status!='revoked'",[input.organizationId,input.userId,input.roleId]);
    if(!result.rowCount)throw new Error("MEMBER_NOT_FOUND");
    await auditOrganizationChange(client,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"member.role_changed",targetType:"membership",targetId:input.userId,metadata:{roleId:input.roleId}});
  });
}
export async function setOrganizationMemberStatus(pool:Pool,input:{organizationId:string;actorUserId:string;userId:string;status:"active"|"suspended"|"revoked"}):Promise<void>{
  if(input.userId===input.actorUserId&&input.status!=="active")throw new Error("SELF_LOCKOUT_FORBIDDEN");
  return withTx(pool,async client=>{
    const actor=await client.query(`SELECT r.permissions FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' FOR SHARE`,[input.organizationId,input.actorUserId]);
    if(!actor.rows[0]?.permissions?.includes("member.manage"))throw new Error("PERMISSION_DENIED");
    const result=await client.query("UPDATE organization_memberships SET status=$3 WHERE organization_id=$1 AND user_id=$2",[input.organizationId,input.userId,input.status]);
    if(!result.rowCount)throw new Error("MEMBER_NOT_FOUND");
    await auditOrganizationChange(client,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"member.status_changed",targetType:"membership",targetId:input.userId,metadata:{status:input.status}});
  });
}

export const ORGANIZATION_PERMISSIONS = [
  "org.read","org.manage","member.manage","finance.read","finance.initiate","finance.approve",
  "ledger.read","audit.read","security.manage","content.read","content.write","social.moderate",
  "recruitment.manage","marketplace.manage","documents.read","documents.write"
] as const;
const ORGANIZATION_PERMISSION_SET = new Set<string>(ORGANIZATION_PERMISSIONS);

function normalizePermissions(input:string[]):string[]{
  const permissions=[...new Set(input.map(p=>p.trim()).filter(Boolean))];
  if(permissions.some(p=>!ORGANIZATION_PERMISSION_SET.has(p))) throw new Error("INVALID_PERMISSION");
  return permissions;
}

async function auditOrganizationChange(
  client: PoolClient,
  input:{organizationId:string;actorUserId?:string;action:string;targetType?:string;targetId?:string;metadata?:Record<string,unknown>}
):Promise<void>{
  await client.query(
    `INSERT INTO organization_audit_events(id,organization_id,actor_user_id,action,target_type,target_id,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(),input.organizationId,input.actorUserId??null,input.action,input.targetType??null,input.targetId??null,JSON.stringify(input.metadata??{})]
  );
}

export async function getOrganization(
  pool:Pool,
  input:{organizationId:string;actorUserId:string}
):Promise<Record<string,unknown>>{
  const result=await pool.query(
    `SELECT o.id,o.name,o.type,o.status,o.founder_id,o.created_at,
            m.status AS membership_status,r.id AS role_id,r.name AS role_name,r.permissions
       FROM organizations o
       JOIN organization_memberships m ON m.organization_id=o.id AND m.user_id=$2
       JOIN organization_roles r ON r.id=m.role_id
      WHERE o.id=$1`,
    [input.organizationId,input.actorUserId]
  );
  const row=result.rows[0];
  if(!row || row.membership_status!=="active" || row.status!=="active") throw new Error("ORGANIZATION_ACCESS_DENIED");
  return {
    id:String(row.id),name:String(row.name),type:String(row.type),status:String(row.status),
    founderId:String(row.founder_id),createdAt:new Date(String(row.created_at)).toISOString(),
    membershipStatus:String(row.membership_status),roleId:String(row.role_id),roleName:String(row.role_name),
    permissions:Array.isArray(row.permissions)?row.permissions.map(String):[]
  };
}

export async function updateOrganization(
  pool:Pool,
  input:{organizationId:string;actorUserId:string;name?:string;type?:string;status?:"active"|"suspended"|"closed"}
):Promise<Record<string,unknown>>{
  if(input.name!==undefined && (input.name.trim().length<2 || input.name.trim().length>160)) throw new Error("INVALID_ORGANIZATION_NAME");
  return withTx(pool,async client=>{
    const actor=await client.query(
      `SELECT r.permissions FROM organization_memberships m
       JOIN organization_roles r ON r.id=m.role_id
       WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'
       FOR SHARE`,
      [input.organizationId,input.actorUserId]
    );
    if(!actor.rows[0]?.permissions?.includes("org.manage")) throw new Error("PERMISSION_DENIED");
    const current=await client.query(
      "SELECT id,name,type,status FROM organizations WHERE id=$1 FOR UPDATE",
      [input.organizationId]
    );
    const row=current.rows[0];
    if(!row) throw new Error("ORGANIZATION_NOT_FOUND");
    const nextName=input.name?.trim()??String(row.name);
    const nextType=input.type?.trim()??String(row.type);
    const nextStatus=input.status??String(row.status);
    if(!nextType || nextType.length>80) throw new Error("INVALID_ORGANIZATION_TYPE");
    await client.query(
      "UPDATE organizations SET name=$2,type=$3,status=$4 WHERE id=$1",
      [input.organizationId,nextName,nextType,nextStatus]
    );
    await auditOrganizationChange(client,{
      organizationId:input.organizationId,actorUserId:input.actorUserId,
      action:"organization.updated",targetType:"organization",targetId:input.organizationId,
      metadata:{before:{name:row.name,type:row.type,status:row.status},after:{name:nextName,type:nextType,status:nextStatus}}
    });
    return {id:String(input.organizationId),name:nextName,type:nextType,status:nextStatus};
  });
}

export async function listOrganizationAudit(
  pool:Pool,input:{organizationId:string;actorUserId:string;limit?:number}
):Promise<Array<Record<string,unknown>>>{
  const access=await pool.query(
    `SELECT r.permissions FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id
     WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active'`,
    [input.organizationId,input.actorUserId]
  );
  if(!access.rows[0]?.permissions?.includes("audit.read")) throw new Error("PERMISSION_DENIED");
  const limit=Math.min(100,Math.max(1,input.limit??50));
  const result=await pool.query(
    `SELECT id,actor_user_id,action,target_type,target_id,metadata,created_at
       FROM organization_audit_events WHERE organization_id=$1
       ORDER BY created_at DESC,id DESC LIMIT $2`,
    [input.organizationId,limit]
  );
  return result.rows.map(row=>({
    id:String(row.id),actorUserId:row.actor_user_id?String(row.actor_user_id):null,
    action:String(row.action),targetType:row.target_type?String(row.target_type):null,
    targetId:row.target_id?String(row.target_id):null,metadata:row.metadata??{},
    createdAt:new Date(String(row.created_at)).toISOString()
  }));
}

export async function createOrganizationInvitation(
  pool:Pool,
  input:{organizationId:string;actorUserId:string;loginIdentifier:string;roleId:string;expiresInHours?:number}
):Promise<{invitationId:string;token:string;expiresAt:string}>{
  const login=normalizeLoginIdentifier(input.loginIdentifier);
  const expiresAt=new Date(Date.now()+Math.min(168,Math.max(1,input.expiresInHours??72))*60*60*1000);
  return withTx(pool,async client=>{
    const actor=await client.query(
      `SELECT r.permissions FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id
       WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' FOR SHARE`,
      [input.organizationId,input.actorUserId]
    );
    if(!actor.rows[0]?.permissions?.includes("member.manage")) throw new Error("PERMISSION_DENIED");
    const role=await client.query("SELECT id FROM organization_roles WHERE organization_id=$1 AND id=$2",[input.organizationId,input.roleId]);
    if(!role.rowCount) throw new Error("ROLE_NOT_FOUND");
    const user=await client.query("SELECT id FROM users WHERE login_identifier=$1 AND status='active'",[login]);
    if(!user.rowCount) throw new Error("INVITED_USER_NOT_FOUND");
    const existing=await client.query(
      "SELECT status FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",
      [input.organizationId,user.rows[0].id]
    );
    if(existing.rows[0]?.status==="active") throw new Error("MEMBER_ALREADY_ACTIVE");
    const invitationId=randomUUID();
    const token=generateOpaqueToken(32);
    await client.query(
      `INSERT INTO organization_invitations(id,organization_id,invited_by_user_id,login_identifier,role_id,token_hash,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [invitationId,input.organizationId,input.actorUserId,login,input.roleId,sha256Hex(token),expiresAt]
    );
    await auditOrganizationChange(client,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"member.invitation.created",targetType:"invitation",targetId:invitationId,metadata:{loginIdentifier:login,roleId:input.roleId}});
    return {invitationId,token,expiresAt:expiresAt.toISOString()};
  });
}

export async function acceptOrganizationInvitation(
  pool:Pool,
  input:{organizationId:string;invitationId:string;token:string;userId:string}
):Promise<void>{
  return withTx(pool,async client=>{
    const invitation=(await client.query(
      `SELECT id,login_identifier,role_id,status,expires_at FROM organization_invitations
       WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [input.invitationId,input.organizationId]
    )).rows[0];
    if(!invitation || invitation.status!=="pending" || new Date(invitation.expires_at).getTime()<=Date.now()) throw new Error("INVITATION_INVALID");
    const user=(await client.query("SELECT id,login_identifier,status FROM users WHERE id=$1",[input.userId])).rows[0];
    if(!user || user.status!=="active" || String(user.login_identifier)!==String(invitation.login_identifier)) throw new Error("INVITATION_IDENTITY_MISMATCH");
    const valid=sha256Hex(input.token)===String(invitation.token_hash);
    if(!valid) throw new Error("INVITATION_INVALID");
    const role=(await client.query("SELECT id FROM organization_roles WHERE organization_id=$1 AND id=$2",[input.organizationId,invitation.role_id])).rows[0];
    if(!role) throw new Error("ROLE_NOT_FOUND");
    await client.query(
      `INSERT INTO organization_memberships(organization_id,user_id,role_id,status)
       VALUES($1,$2,$3,'active')
       ON CONFLICT(organization_id,user_id) DO UPDATE SET role_id=EXCLUDED.role_id,status='active'`,
      [input.organizationId,input.userId,invitation.role_id]
    );
    await client.query(
      "UPDATE organization_invitations SET status='accepted',accepted_by_user_id=$2,accepted_at=now() WHERE id=$1",
      [input.invitationId,input.userId]
    );
    await auditOrganizationChange(client,{organizationId:input.organizationId,actorUserId:input.userId,action:"member.invitation.accepted",targetType:"membership",targetId:input.userId,metadata:{invitationId:input.invitationId}});
  });
}

export async function issueOrganizationPortalCode(
  pool:Pool,
  input:{organizationId:string;actorUserId:string;userId:string;expiresInHours?:number}
):Promise<{codeId:string;code:string;expiresAt:string}>{
  const expiresAt=new Date(Date.now()+Math.min(720,Math.max(1,input.expiresInHours??24))*60*60*1000);
  return withTx(pool,async client=>{
    const actor=await client.query(
      `SELECT r.permissions FROM organization_memberships m JOIN organization_roles r ON r.id=m.role_id
       WHERE m.organization_id=$1 AND m.user_id=$2 AND m.status='active' FOR SHARE`,
      [input.organizationId,input.actorUserId]
    );
    if(!actor.rows[0]?.permissions?.includes("member.manage")) throw new Error("PERMISSION_DENIED");
    const member=await client.query("SELECT status FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",[input.organizationId,input.userId]);
    if(member.rows[0]?.status!=="active") throw new Error("MEMBER_NOT_FOUND");
    await client.query("UPDATE organization_portal_codes SET status='revoked',revoked_at=now() WHERE organization_id=$1 AND user_id=$2 AND status='active'",[input.organizationId,input.userId]);
    const codeId=randomUUID();
    const code=generateOpaqueToken(12);
    await client.query(
      "INSERT INTO organization_portal_codes(id,organization_id,user_id,code_hash,expires_at) VALUES($1,$2,$3,$4,$5)",
      [codeId,input.organizationId,input.userId,sha256Hex(code),expiresAt]
    );
    await auditOrganizationChange(client,{organizationId:input.organizationId,actorUserId:input.actorUserId,action:"member.portal_code.issued",targetType:"portal_code",targetId:codeId,metadata:{userId:input.userId}});
    return {codeId,code,expiresAt:expiresAt.toISOString()};
  });
}

export async function openOrganizationPortalSession(
  pool:Pool,
  input:{sessionToken:string;organizationId:string;portalCode:string}
):Promise<AuthenticatedSession>{
  return withTx(pool,async client=>{
    const session=(await client.query(
      "SELECT id,user_id,csrf_hash,expires_at,assurance FROM identity_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
      [sha256Hex(input.sessionToken)]
    )).rows[0];
    if(!session) throw new Error("SESSION_INVALID");
    const code=(await client.query(
      `SELECT id,user_id,code_hash,status,expires_at FROM organization_portal_codes
       WHERE organization_id=$1 AND user_id=$2 AND status='active' AND expires_at>now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.organizationId,session.user_id]
    )).rows[0];
    if(!code || sha256Hex(input.portalCode)!==String(code.code_hash)) throw new Error("PORTAL_CODE_INVALID");
    const membership=(await client.query(
      "SELECT status FROM organization_memberships WHERE organization_id=$1 AND user_id=$2",[input.organizationId,session.user_id]
    )).rows[0];
    if(membership?.status!=="active") throw new Error("ORGANIZATION_ACCESS_DENIED");
    await client.query("UPDATE identity_sessions SET organization_id=$2,last_seen_at=now() WHERE id=$1",[session.id,input.organizationId]);
    await auditOrganizationChange(client,{organizationId:input.organizationId,actorUserId:session.user_id,action:"member.portal_session.opened",targetType:"portal_code",targetId:String(code.id),metadata:{}});
    return sessionResult({...session,organization_id:input.organizationId},"");
  });
}
