import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("global identity RLS isolates two tenants under a non-owner non-BYPASSRLS role", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  const owner = new pg.Client({ connectionString: databaseUrl });
  await owner.connect();

  const suffix = randomUUID().replace(/-/g, "");
  const role = `tpay_identity_rls_${suffix}`;
  const tenantA = `tenant-a-${suffix}`;
  const tenantB = `tenant-b-${suffix}`;
  const orgA = randomUUID();
  const orgB = randomUUID();
  const subjectA = randomUUID();
  const subjectB = randomUUID();
  const actorA = randomUUID();
  const actorB = randomUUID();
  const actorLinkA = randomUUID();
  const actorLinkB = randomUUID();
  const tenantMembershipA = randomUUID();
  const tenantMembershipB = randomUUID();
  const orgMembershipA = randomUUID();
  const orgMembershipB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  let roleCreated = false;

  try {
    await applyMigrations(owner, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const privilege = await owner.query<{ rolsuper: boolean; rolcreaterole: boolean }>(
      "SELECT rolsuper,rolcreaterole FROM pg_roles WHERE rolname=current_user"
    );
    assert.ok(privilege.rows[0]?.rolsuper || privilege.rows[0]?.rolcreaterole,
      "PostgreSQL integration account must be able to create a constrained test role");

    await owner.query(`CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    roleCreated = true;
    await owner.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await owner.query(`GRANT SELECT ON tpay_tenants,tpay_organization_tenants,identity_subjects,identity_actor_links,identity_tenant_memberships,identity_organization_memberships,identity_permission_grants,identity_sessions,identity_audit TO "${role}"`);

    const now = new Date(Date.now() - 60_000).toISOString();
    const later = new Date(Date.now() + 60 * 60_000).toISOString();
    await owner.query("INSERT INTO organizations(id,name,status,created_at) VALUES ($1,'RLS tenant A','active',now()),($2,'RLS tenant B','active',now())", [orgA, orgB]);
    await owner.query("INSERT INTO tpay_tenants(id) VALUES ($1),($2)", [tenantA, tenantB]);
    await owner.query("INSERT INTO tpay_organization_tenants(tenant_id,organization_id) VALUES ($1,$2),($3,$4)", [tenantA, orgA, tenantB, orgB]);
    await owner.query("INSERT INTO identity_subjects(id) VALUES ($1),($2)", [subjectA, subjectB]);
    await owner.query(
      "INSERT INTO identity_actor_links(id,subject_id,tenant_id,organization_id,domain_code,actor_id,status) VALUES ($1,$2,$3,$4,'community_tontine',$5,'active'),($6,$7,$8,$9,'community_tontine',$10,'active')",
      [actorLinkA, subjectA, tenantA, orgA, actorA, actorLinkB, subjectB, tenantB, orgB, actorB]
    );
    await owner.query(
      "INSERT INTO identity_tenant_memberships(id,subject_id,tenant_id,status,valid_from) VALUES ($1,$2,$3,'active',$4),($5,$6,$7,'active',$4)",
      [tenantMembershipA, subjectA, tenantA, now, tenantMembershipB, subjectB, tenantB]
    );
    await owner.query(
      "INSERT INTO identity_organization_memberships(id,tenant_membership_id,subject_id,tenant_id,organization_id,status,valid_from) VALUES ($1,$2,$3,$4,$5,'active',$6),($7,$8,$9,$10,$11,'active',$6)",
      [orgMembershipA, tenantMembershipA, subjectA, tenantA, orgA, now, orgMembershipB, tenantMembershipB, subjectB, tenantB, orgB]
    );
    await owner.query(
      "INSERT INTO identity_permission_grants(id,membership_id,tenant_id,organization_id,domain_code,permission,valid_from,valid_until,granted_by_subject_id) VALUES ($1,$2,$3,$4,'community_tontine','community.tontine.read',$5,$6,$7),($8,$9,$10,$11,'community_tontine','community.tontine.read',$5,$6,$12)",
      [grantA, orgMembershipA, tenantA, orgA, now, later, subjectA, grantB, orgMembershipB, tenantB, orgB, subjectB]
    );
    await owner.query(
      "INSERT INTO identity_audit(tenant_id,organization_id,subject_id,actor_id,action,reason_code) VALUES ($1,$2,$3,$4,'subject_created','rls-test-a'),($5,$6,$7,$8,'subject_created','rls-test-b')",
      [tenantA, orgA, subjectA, actorA, tenantB, orgB, subjectB, actorB]
    );

    const runtime = new pg.Client({ connectionString: databaseUrl });
    await runtime.connect();
    try {
      await runtime.query(`SET ROLE "${role}"`);
      await runtime.query("BEGIN");
      await runtime.query("SELECT set_config('tpay.tenant_id',$1,true)", [tenantA]);
      await runtime.query("SELECT set_config('tpay.organization_id',$1,true)", [orgA]);

      const visible = async (table: string, column = "id") => {
        const result = await runtime.query(`SELECT ${column}::text AS id FROM public.${table} ORDER BY 1`);
        return result.rows.map(row => row.id);
      };
      assert.deepEqual(await visible("tpay_tenants"), [tenantA]);
      assert.deepEqual(await visible("tpay_organization_tenants", "organization_id"), [orgA]);
      assert.deepEqual(await visible("identity_subjects"), [subjectA]);
      assert.deepEqual(await visible("identity_actor_links"), [actorLinkA]);
      assert.deepEqual(await visible("identity_tenant_memberships"), [tenantMembershipA]);
      assert.deepEqual(await visible("identity_organization_memberships"), [orgMembershipA]);
      assert.deepEqual(await visible("identity_permission_grants"), [grantA]);
      assert.deepEqual(await visible("identity_audit", "id").then(rows => rows.length), 1);
      await runtime.query("ROLLBACK");
      await runtime.query("RESET ROLE");
    } finally {
      await runtime.end();
    }
  } finally {
    if (roleCreated) {
      await owner.query("DELETE FROM identity_audit WHERE tenant_id=ANY($1::text[])", [[tenantA, tenantB]]);
      await owner.query("DELETE FROM identity_permission_grants WHERE id=ANY($1::uuid[])", [[grantA, grantB]]);
      await owner.query("DELETE FROM identity_organization_memberships WHERE id=ANY($1::uuid[])", [[orgMembershipA, orgMembershipB]]);
      await owner.query("DELETE FROM identity_tenant_memberships WHERE id=ANY($1::uuid[])", [[tenantMembershipA, tenantMembershipB]]);
      await owner.query("DELETE FROM identity_actor_links WHERE id=ANY($1::uuid[])", [[actorLinkA, actorLinkB]]);
      await owner.query("DELETE FROM identity_subjects WHERE id=ANY($1::uuid[])", [[subjectA, subjectB]]);
      await owner.query("DELETE FROM tpay_organization_tenants WHERE tenant_id=ANY($1::text[])", [[tenantA, tenantB]]);
      await owner.query("DELETE FROM tpay_tenants WHERE id=ANY($1::text[])", [[tenantA, tenantB]]);
      await owner.query("DELETE FROM organizations WHERE id=ANY($1::uuid[])", [[orgA, orgB]]);
      await owner.query(`DROP OWNED BY "${role}"`);
      await owner.query(`DROP ROLE "${role}"`);
    }
    await owner.end();
  }
});
