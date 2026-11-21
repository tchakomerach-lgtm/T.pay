import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("Financial Core Payment Intents enforce FORCE RLS and deny cross-organization reads and writes", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  if (!databaseUrl) return;
  const owner = new pg.Client({ connectionString: databaseUrl });
  const role = "tpay_payment_intent_rls_" + randomUUID().replace(/-/g, "");
  const orgA = randomUUID(), orgB = randomUUID();
  const intentA = randomUUID(), intentB = randomUUID();
  let roleCreated = false;
  let transactionOpen = false;

  try {
    await owner.connect();
    await applyMigrations(owner, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const privilege = await owner.query<{ rolsuper: boolean; rolcreaterole: boolean }>(
      "SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user"
    );
    assert.ok(privilege.rows[0]?.rolsuper || privilege.rows[0]?.rolcreaterole,
      "PostgreSQL integration account must be able to create a constrained test role");

    await owner.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    roleCreated = true;
    await owner.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await owner.query(`GRANT SELECT,INSERT,UPDATE ON payment_intents TO "${role}"`);

    await owner.query("BEGIN");
    transactionOpen = true;
    await owner.query(
      "INSERT INTO organizations(id,name,status,created_at) VALUES ($1,'Payment Intent A','active',now()),($2,'Payment Intent B','active',now())",
      [orgA, orgB]
    );
    const insertIntent = (id: string, organizationId: string, key: string) => owner.query(
      `INSERT INTO payment_intents
       (id,organization_id,idempotency_key,payload_hash,payer_account_id,payee_account_id,
        amount_minor,currency,state,requires_human_approval,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,2500,'XOF','pending_approval',true,now(),now())`,
      [id, organizationId, key, "a".repeat(64), randomUUID(), randomUUID()]
    );
    await insertIntent(intentA, orgA, "ct042-premium-a-0001");
    await insertIntent(intentB, orgB, "ct042-premium-b-0001");

    const metadata = await owner.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity,relforcerowsecurity FROM pg_class
       WHERE oid='public.payment_intents'::regclass`
    );
    assert.equal(metadata.rows[0]?.relrowsecurity, true);
    assert.equal(metadata.rows[0]?.relforcerowsecurity, true);

    const policies = await owner.query<{ policyname: string; permissive: string; qual: string | null; with_check: string | null }>(
      `SELECT policyname,permissive,qual,with_check FROM pg_policies
       WHERE schemaname='public' AND tablename='payment_intents'`
    );
    const access = policies.rows.find(row => row.policyname === "payment_intents_organization_access");
    const fence = policies.rows.find(row => row.policyname === "payment_intents_tenant_fence");
    assert.ok(access, "organization access policy must exist");
    assert.equal(access.permissive, "PERMISSIVE");
    assert.match(access.qual ?? "", /tpay_current_organization_id/);
    assert.match(access.with_check ?? "", /tpay_current_organization_id/);
    assert.ok(fence, "restrictive tenant fence must exist");
    assert.equal(fence.permissive, "RESTRICTIVE");
    assert.match(fence.qual ?? "", /tpay_current_organization_id/);
    assert.match(fence.with_check ?? "", /tpay_current_organization_id/);

    await owner.query(`SET LOCAL SESSION AUTHORIZATION "${role}"`);
    const identity = await owner.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT current_user,r.rolsuper,r.rolbypassrls FROM pg_roles r WHERE r.rolname=current_user"
    );
    assert.equal(identity.rows[0]?.current_user, role);
    assert.equal(identity.rows[0]?.rolsuper, false);
    assert.equal(identity.rows[0]?.rolbypassrls, false);

    const withoutContext = await owner.query("SELECT id FROM payment_intents");
    assert.equal(withoutContext.rowCount, 0, "missing organization context must fail closed");

    await owner.query("SELECT set_config('tpay.organization_id',$1,true)", [orgA]);
    const visibleA = await owner.query<{ id: string }>("SELECT id::text AS id FROM payment_intents ORDER BY id");
    assert.deepEqual(visibleA.rows.map(row => row.id), [intentA],
      "organization A must not read organization B Payment Intents");

    let crossTenantError: unknown;
    try {
      await owner.query(
        `INSERT INTO payment_intents
         (id,organization_id,idempotency_key,payload_hash,payer_account_id,payee_account_id,
          amount_minor,currency,state,requires_human_approval,created_at,updated_at)
         VALUES ($1,$2,'cross-tenant-key-0001,$3,$4,$5,2500,'XOF','pending_approval',true,now(),now())`,
        [randomUUID(), orgB, "b".repeat(64), randomUUID(), randomUUID()]
      );
    } catch (error) { crossTenantError = error; }
    assert.ok(crossTenantError && typeof crossTenantError === "object" &&
      "code" in crossTenantError && (crossTenantError as { code: string }).code === "42501",
      "organization A must not insert an intent for organization B");
  } finally {
    if (transactionOpen) await owner.query("ROLLBACK").catch(() => undefined);
    if (roleCreated) await owner.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => undefined);
    await owner.end().catch(() => undefined);
  }
});
