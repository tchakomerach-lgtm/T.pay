import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import {
  registerWithPassword,
  loginWithPassword,
  logout,
  resolveSession,
  rotateSession,
  createOrganizationWithFounder,
} from "../packages/identity/src/postgres.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("L17 identity persistence: registration, secure session, rotation and logout", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  const login = `identity-${randomUUID()}@test.invalid`;
  let userId: string | undefined;
  try {
    const setup = await pool.connect();
    try {
      await applyMigrations(setup, new URL("../../migrations/", import.meta.url));
    } finally {
      setup.release();
    }
    const registered = await registerWithPassword(pool, {
      loginIdentifier: login,
      displayName: "Identity Test",
      password: "correct horse battery staple 123",
    });
    userId = registered.userId;
    assert.ok(registered.session.sessionId);
    assert.equal(registered.session.userId, userId);
    assert.ok(registered.session.csrfToken.length >= 40);

    const authenticated = await loginWithPassword(pool, { loginIdentifier: login, password: "correct horse battery staple 123" });
    assert.equal(authenticated.userId, userId);
    const rotated = await rotateSession(pool, authenticated.sessionToken);
    assert.equal(rotated.session.userId, userId);
    assert.notEqual(rotated.sessionToken, authenticated.sessionToken);

    await logout(pool, rotated.sessionToken);
    await assert.rejects(() => resolveSession(pool, rotated.sessionToken), /SESSION_INVALID/);
  } finally {
    if (userId) await pool.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => undefined);
    await pool.end();
  }
});

test("L17 identity persistence: founder organization membership is atomic and tenant-scoped", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  let userId: string | undefined;
  let organizationId: string | undefined;
  try {
    const client = await pool.connect();
    try {
      await applyMigrations(client, new URL("../../migrations/", import.meta.url));
    } finally {
      client.release();
    }

    const registered = await registerWithPassword(pool, {
      loginIdentifier: `founder-${randomUUID()}@test.invalid`,
      displayName: "Founder Test",
      password: "correct horse battery staple 456",
    });
    userId = registered.userId;
    const created = await createOrganizationWithFounder(pool, {
      founderId: userId,
      name: "T.Pay Test Organization",
      type: "company",
      accessCode: "secure-org-access-123",
    });
    organizationId = created.organizationId;

    const membership = await pool.query(
      `SELECT m.organization_id,m.user_id,r.name,r.permissions
         FROM organization_memberships m
         JOIN organization_roles r ON r.id=m.role_id AND r.organization_id=m.organization_id
        WHERE m.organization_id=$1 AND m.user_id=$2`,
      [organizationId, userId]
    );
    assert.equal(membership.rowCount, 1);
    assert.equal(membership.rows[0].name, "Fondateur");
    assert.ok(membership.rows[0].permissions.includes("org.manage"));

    const access = await pool.query("SELECT access_code_hash FROM organizations WHERE id=$1", [organizationId]);
    assert.ok(access.rows[0].access_code_hash);
    assert.notEqual(access.rows[0].access_code_hash, "secure-org-access-123");
    assert.match(access.rows[0].access_code_hash, /^scrypt\$/);
  } finally {
    if (organizationId) await pool.query("DELETE FROM organizations WHERE id=$1", [organizationId]).catch(() => undefined);
    if (userId) await pool.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => undefined);
    await pool.end();
  }
});

test("L17 password lockout is persisted under concurrent failed attempts", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  const login = `lockout-${randomUUID()}@test.invalid`;
  let userId: string | undefined;
  try {
    const registered = await registerWithPassword(pool, {
      loginIdentifier: login,
      displayName: "Lockout Test",
      password: "correct horse battery staple 789",
    });
    userId = registered.userId;
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => loginWithPassword(pool, { loginIdentifier: login, password: "wrong password" }).then(() => "unexpected-success").catch(error => error.message))
    );
    assert.equal(attempts.filter(value => value === "AUTHENTICATION_FAILED").length, 6);
    const credential = await pool.query(
      "SELECT failed_attempts,locked_until FROM identity_credentials WHERE user_id=$1 AND kind='password'",
      [userId]
    );
    assert.equal(credential.rows[0].failed_attempts, 5);
    assert.ok(credential.rows[0].locked_until);
  } finally {
    if (userId) await pool.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => undefined);
    await pool.end();
  }
});

