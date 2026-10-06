import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { generateOpaqueToken, hashPassword, hashSecret, normalizeLoginIdentifier, sha256Hex, verifyPassword } from "./crypto.js";

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
}

export interface IdentityConfig {
  sessionTtlMs?: number;
  lockoutAfterFailures?: number;
  lockoutMs?: number;
}

const defaults = { sessionTtlMs: 8 * 60 * 60 * 1000, lockoutAfterFailures: 5, lockoutMs: 15 * 60 * 1000 };

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

async function createSession(client: PoolClient, userId: string, config: Required<IdentityConfig>, organizationId?: string, rotatedFromId?: string): Promise<AuthenticatedSession> {
  const sessionId = randomUUID();
  const token = generateOpaqueToken(32);
  const csrfToken = generateOpaqueToken(32);
  const expires = new Date(Date.now() + config.sessionTtlMs);
  await client.query(
    `INSERT INTO identity_sessions(id,user_id,organization_id,token_hash,csrf_hash,expires_at,rotated_from_id)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [sessionId,userId,organizationId ?? null,sha256Hex(token),sha256Hex(csrfToken),expires,rotatedFromId ?? null]
  );
  return { sessionId, userId, ...(organizationId ? {organizationId} : {}), csrfToken, expiresAt: expires.toISOString(), assurance:"standard", };
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
    return { userId, session: await createSession(client,userId,cfg) };
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
    if (!row || row.status !== "active" || row.credential_status !== "active" || (row.locked_until && new Date(row.locked_until).getTime() > Date.now())) {
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
    return { userId: row.user_id, session: await createSession(client,row.user_id,cfg) };
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

export async function rotateSession(pool: Pool, token: string): Promise<AuthenticatedSession> {
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
    const session = await createSession(client,row.user_id,{...defaults},row.organization_id,row.id);
    return session;
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

export function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  if (!token) throw new Error("SESSION_TOKEN_REQUIRED");
  return `__Host-tpay_session=${token}; Max-Age=${Math.max(1,Math.floor(maxAgeSeconds))}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function buildCsrfCookie(token: string, maxAgeSeconds: number): string {
  if (!token) throw new Error("CSRF_TOKEN_REQUIRED");
  return `__Host-tpay_csrf=${token}; Max-Age=${Math.max(1,Math.floor(maxAgeSeconds))}; Path=/; Secure; SameSite=Strict`;
}

export function assertCsrf(requestOrigin: string | undefined, expectedOrigin: string, csrfCookie: string | undefined, csrfHeader: string | undefined): void {
  if (!requestOrigin || requestOrigin !== expectedOrigin) throw new Error("CSRF_ORIGIN_REJECTED");
  if (!csrfCookie || !csrfHeader || csrfCookie.length < 32 || csrfHeader.length < 32 || !timingSafeEqual(Buffer.from(csrfCookie),Buffer.from(csrfHeader))) {
    throw new Error("CSRF_TOKEN_REJECTED");
  }
}
