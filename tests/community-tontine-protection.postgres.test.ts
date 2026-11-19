import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("CT-042 PostgreSQL enforces organization RLS, composite scope, immutable events and one active policy", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  const owner = new pg.Client({ connectionString: databaseUrl });
  const suffix = randomUUID().replace(/-/g, "");
  const role = "tpay_ct042_rls_" + suffix;
  const orgA = randomUUID(), orgB = randomUUID();
  const groupA = randomUUID(), groupB = randomUUID();
  const actorA = randomUUID(), actorB = randomUUID();
  const memberA = randomUUID(), memberB = randomUUID();
  const policyA = randomUUID(), policyB = randomUUID();
  const enrollmentA = randomUUID(), enrollmentB = randomUUID();
  const premiumA = randomUUID(), premiumB = randomUUID();
  const claimA = randomUUID(), claimB = randomUUID();
  const eventA = randomUUID(), eventB = randomUUID();
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
    await owner.query(`GRANT SELECT,INSERT,UPDATE ON
      community_tontine_protection_policies,
      community_tontine_protection_enrollments,
      community_tontine_protection_premiums,
      community_tontine_protection_claims,
      community_tontine_protection_events
      TO "${role}"`);

    await owner.query("BEGIN");
    transactionOpen = true;
    await owner.query(
      "INSERT INTO organizations(id,name,status,created_at) VALUES ($1,'CT042 A','active',now()),($2,'CT042 B','active',now())",
      [orgA, orgB]
    );
    await owner.query(
      `INSERT INTO tontine_groups
       (id,organization_id,name,country_code,currency,frequency,contribution_mode,minimum_amount_minor,
        cycle_number,governance,status,created_by,created_at)
       VALUES ($1,$2,'CT042 group A','TG','XOF','weekly','fixed',1000,1,'member_vote','active',$3,now()),
              ($4,$5,'CT042 group B','TG','XOF','weekly','fixed',1000,1,'member_vote','active',$6,now())`,
      [groupA, orgA, actorA, groupB, orgB, actorB]
    );
    await owner.query(
      `INSERT INTO tontine_memberships(id,organization_id,group_id,client_id,role,status,joined_at)
       VALUES ($1,$2,$3,$4,'founder','active',now()),($5,$6,$7,$8,'founder','active',now())`,
      [memberA, orgA, groupA, actorA, memberB, orgB, groupB, actorB]
    );

    const insertPolicy = async (id: string, org: string, group: string, actor: string, version: string) => owner.query(
      `INSERT INTO community_tontine_protection_policies
       (id,organization_id,group_id,version,currency,state,proposal_origin,risk_bearer,
        insurer_partner_id,insurer_license_reference,insurer_contract_reference,
        insurer_license_verified,insurer_contract_verified,effective_from,tiers,policy_hash,created_by)
       VALUES ($1,$2,$3,$4,'XOF','DRAFT','COMMUNITY_ADMIN','LICENSED_INSURER',
        $5,'LICENSE-PENDING','CONTRACT-PENDING',false,false,now(),
        '[{"tier":"ESSENTIEL","premiumRateBps":100,"coveredInstallments":1,"gracePeriodDays":7,"waitingPeriodDays":14,"maxClaimMinor":"10000"},{"tier":"EQUILIBRE","premiumRateBps":200,"coveredInstallments":2,"gracePeriodDays":14,"waitingPeriodDays":14,"maxClaimMinor":"20000"},{"tier":"RENFORCE","premiumRateBps":300,"coveredInstallments":3,"gracePeriodDays":21,"waitingPeriodDays":30,"maxClaimMinor":"30000"}]'::jsonb,
        $6,$7)`,
      [id, org, group, version, randomUUID(), "a".repeat(64), actor]
    );
    await insertPolicy(policyA, orgA, groupA, actorA, "v1");
    await insertPolicy(policyB, orgB, groupB, actorB, "v1");

    const insertEnrollment = async (id: string, org: string, group: string, member: string, policy: string) => owner.query(
      `INSERT INTO community_tontine_protection_enrollments
       (id,organization_id,group_id,member_id,policy_id,tier,state,accepted_at,coverage_starts_at,consent_reference)
       VALUES ($1,$2,$3,$4,$5,'EQUILIBRE','ACTIVE',now(),now(),$6)`,
      [id, org, group, member, policy, "consent-" + id]
    );
    await insertEnrollment(enrollmentA, orgA, groupA, memberA, policyA);
    await insertEnrollment(enrollmentB, orgB, groupB, memberB, policyB);

    const installmentA = randomUUID(), installmentB = randomUUID();
    await owner.query(
      `INSERT INTO community_tontine_protection_premiums
       (id,organization_id,group_id,enrollment_id,installment_reference,currency,
        installment_minor,premium_minor,rate_bps,state,due_at)
       VALUES ($1,$2,$3,$4,$5,'XOF',100000,2000,200,'DUE',now()),
              ($6,$7,$8,$9,$10,'XOF',100000,2000,200,'DUE',now())`,
      [premiumA, orgA, groupA, enrollmentA, installmentA, premiumB, orgB, groupB, enrollmentB, installmentB]
    );
    await owner.query(
      `INSERT INTO community_tontine_protection_claims
       (id,organization_id,group_id,enrollment_id,installment_reference,premium_id,state,
        claimed_minor,currency,evidence,submitted_by,submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,'SUBMITTED',1000,'XOF','{"source":"test"}'::jsonb,$7,now()),
              ($8,$9,$10,$11,$12,$13,'SUBMITTED',1000,'XOF','{"source":"test"}'::jsonb,$14,now())`,
      [claimA, orgA, groupA, enrollmentA, installmentA, premiumA, actorA,
       claimB, orgB, groupB, enrollmentB, installmentB, premiumB, actorB]
    );
    await owner.query(
      `INSERT INTO community_tontine_protection_events
       (id,organization_id,group_id,enrollment_id,claim_id,actor_id,event_type,payload,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,'CLAIM_SUBMITTED','{"test":true}'::jsonb,now()),
              ($7,$8,$9,$10,$11,$12,'CLAIM_SUBMITTED','{"test":true}'::jsonb,now())`,
      [eventA, orgA, groupA, enrollmentA, claimA, actorA,
       eventB, orgB, groupB, enrollmentB, claimB, actorB]
    );

    const scopedTables = [
      "community_tontine_protection_policies",
      "community_tontine_protection_enrollments",
      "community_tontine_protection_premiums",
      "community_tontine_protection_claims",
      "community_tontine_protection_events"
    ];
    const metadata = await owner.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
      [scopedTables]
    );
    assert.equal(metadata.rowCount, scopedTables.length);
    for (const row of metadata.rows) {
      assert.equal(row.relrowsecurity, true, row.relname + " must enable RLS");
      assert.equal(row.relforcerowsecurity, true, row.relname + " must force RLS");
    }

    const policies = await owner.query<{ tablename: string; qual: string | null; with_check: string | null }>(
      `SELECT tablename,qual,with_check FROM pg_policies
       WHERE schemaname='public' AND policyname=ANY($1::text[])`,
      [scopedTables.map(table => table + "_organization_scope")]
    );
    assert.equal(policies.rowCount, scopedTables.length);
    for (const table of scopedTables) {
      const policy = policies.rows.find(row => row.tablename === table);
      assert.ok(policy, "missing organization policy for " + table);
      assert.match(policy.qual ?? "", /tpay_current_organization_id/);
      assert.match(policy.with_check ?? "", /tpay_current_organization_id/);
    }

    const tenantFences = await owner.query<{ tablename: string; permissive: string; qual: string | null; with_check: string | null }>(
      `SELECT tablename,permissive,qual,with_check FROM pg_policies
       WHERE schemaname='public' AND policyname=ANY($1::text[])`,
      [scopedTables.map(table => table + "_tenant_fence")]
    );
    assert.equal(tenantFences.rowCount, scopedTables.length,
      "every protection table must have an explicit restrictive tenant fence");
    for (const table of scopedTables) {
      const fence = tenantFences.rows.find(row => row.tablename === table);
      assert.ok(fence, "missing restrictive tenant fence for " + table);
      assert.equal(fence.permissive, "RESTRICTIVE", table + " tenant fence must intersect permissive policies");
      assert.match(fence.qual ?? "", /tpay_current_organization_id/);
      assert.match(fence.with_check ?? "", /tpay_current_organization_id/);
    }

    const expectSqlCode = async (label: string, sql: string, values: unknown[], code: string) => {
      await owner.query("SAVEPOINT " + label);
      let caught: unknown;
      try { await owner.query(sql, values); } catch (error) { caught = error; }
      await owner.query("ROLLBACK TO SAVEPOINT " + label);
      await owner.query("RELEASE SAVEPOINT " + label);
      assert.ok(caught && typeof caught === "object" && "code" in caught &&
        (caught as { code: string }).code === code, "expected PostgreSQL " + code + " for " + label);
    };

    await expectSqlCode("ct042_cross_scope_enrollment",
      `INSERT INTO community_tontine_protection_enrollments
       (id,organization_id,group_id,member_id,policy_id,tier,state,accepted_at,coverage_starts_at,consent_reference)
       VALUES ($1,$2,$3,$4,$5,'EQUILIBRE','ACTIVE',now(),now(),'cross-scope')`,
      [randomUUID(), orgA, groupA, memberA, policyB], "23503");

    const activePolicy = async (id: string, version: string) => owner.query(
      `INSERT INTO community_tontine_protection_policies
       (id,organization_id,group_id,version,currency,state,proposal_origin,risk_bearer,
        insurer_partner_id,insurer_license_reference,insurer_contract_reference,
        insurer_license_verified,insurer_contract_verified,effective_from,tiers,policy_hash,
        created_by,approved_by,activated_at)
       VALUES ($1,$2,$3,$4,'XOF','ACTIVE','COMMUNITY_ADMIN','LICENSED_INSURER',
        $5,'LICENSE-VERIFIED','CONTRACT-VERIFIED',true,true,now(),
        '[{"tier":"ESSENTIEL","premiumRateBps":100,"coveredInstallments":1,"gracePeriodDays":7,"waitingPeriodDays":14,"maxClaimMinor":"10000"},{"tier":"EQUILIBRE","premiumRateBps":200,"coveredInstallments":2,"gracePeriodDays":14,"waitingPeriodDays":14,"maxClaimMinor":"20000"},{"tier":"RENFORCE","premiumRateBps":300,"coveredInstallments":3,"gracePeriodDays":21,"waitingPeriodDays":30,"maxClaimMinor":"30000"}]'::jsonb,
        $6,$7,$8,now())`,
      [id, orgA, groupA, version, randomUUID(), "b".repeat(64), actorA, actorB]
    );
    await activePolicy(randomUUID(), "active-v1");
    await expectSqlCode("ct042_second_active_policy",
      `INSERT INTO community_tontine_protection_policies
       (id,organization_id,group_id,version,currency,state,proposal_origin,risk_bearer,
        insurer_partner_id,insurer_license_reference,insurer_contract_reference,
        insurer_license_verified,insurer_contract_verified,effective_from,tiers,policy_hash,
        created_by,approved_by,activated_at)
       VALUES ($1,$2,$3,'active-v2','XOF','ACTIVE','COMMUNITY_ADMIN','LICENSED_INSURER',
        $4,'LICENSE-VERIFIED','CONTRACT-VERIFIED',true,true,now(),
        '[{"tier":"ESSENTIEL","premiumRateBps":100,"coveredInstallments":1,"gracePeriodDays":7,"waitingPeriodDays":14,"maxClaimMinor":"10000"},{"tier":"EQUILIBRE","premiumRateBps":200,"coveredInstallments":2,"gracePeriodDays":14,"waitingPeriodDays":14,"maxClaimMinor":"20000"},{"tier":"RENFORCE","premiumRateBps":300,"coveredInstallments":3,"gracePeriodDays":21,"waitingPeriodDays":30,"maxClaimMinor":"30000"}]'::jsonb,
        $5,$6,$7,now())`,
      [randomUUID(), orgA, groupA, randomUUID(), "c".repeat(64), actorA, actorB], "23505");

    await owner.query(`SET LOCAL ROLE "${role}"`);
    const visible = async (table: string) => {
      const result = await owner.query<{ id: string }>(`SELECT id::text AS id FROM public.${table} ORDER BY id`);
      return result.rows.map(row => row.id);
    };
    for (const table of scopedTables) {
      assert.deepEqual(await visible(table), [], table + " must deny reads without organization context");
    }
    const setOrganization = async (organizationId: string) => {
      await owner.query("SELECT set_config('tpay.organization_id',$1,true)", [organizationId]);
    };
    await setOrganization(orgA);
    for (const [table, expected] of [
      [scopedTables[0]!, [policyA]],
      [scopedTables[1]!, [enrollmentA]],
      [scopedTables[2]!, [premiumA]],
      [scopedTables[3]!, [claimA]],
      [scopedTables[4]!, [eventA]]
    ] as const) assert.deepEqual(await visible(table), expected, table + " must expose only organization A");
    await expectSqlCode("ct042_cross_org_insert",
      `INSERT INTO community_tontine_protection_events
       (id,organization_id,group_id,actor_id,event_type,payload,occurred_at)
       VALUES ($1,$2,$3,$4,'POLICY_PROPOSED','{"blocked":true}'::jsonb,now())`,
      [randomUUID(), orgB, groupB, actorB], "42501");
    await setOrganization(orgB);
    for (const [table, expected] of [
      [scopedTables[0]!, [policyB]],
      [scopedTables[1]!, [enrollmentB]],
      [scopedTables[2]!, [premiumB]],
      [scopedTables[3]!, [claimB]],
      [scopedTables[4]!, [eventB]]
    ] as const) assert.deepEqual(await visible(table), expected, table + " must expose only organization B");

    await owner.query("RESET ROLE");
    await expectSqlCode("ct042_event_immutable",
      "UPDATE community_tontine_protection_events SET payload='{\"tampered\":true}'::jsonb WHERE id=$1",
      [eventA], "P0001");

    await owner.query("ROLLBACK");
    transactionOpen = false;
  } finally {
    try {
      if (transactionOpen) {
        await owner.query("ROLLBACK");
        transactionOpen = false;
      }
    } finally {
      try {
        if (roleCreated) {
          await owner.query(`DROP OWNED BY "${role}"`);
          await owner.query(`DROP ROLE "${role}"`);
          roleCreated = false;
        }
      } finally {
        await owner.end().catch(() => undefined);
      }
    }
  }
});


test("migration 139 creates RLS-isolated individual coverage and cycle refund closeout tables", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  if (!databaseUrl) return;
  const client = new pg.Client({ connectionString: databaseUrl });
  const expected = [
    "community_tontine_protection_products",
    "community_tontine_individual_coverages",
    "community_tontine_individual_coverage_installments",
    "community_tontine_cycle_closeouts",
    "community_tontine_cycle_refund_allocations",
    "community_tontine_protection_financial_events"
  ];
  await client.connect();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const tables = await client.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(
      `SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname=ANY($1::text[])`,
      [expected]
    );
    assert.equal(tables.rowCount, expected.length);
    for (const table of tables.rows) {
      assert.equal(table.relrowsecurity, true, table.relname + " must enable RLS");
      assert.equal(table.relforcerowsecurity, true, table.relname + " must force RLS");
    }
    const policies = await client.query<{tablename:string;qual:string|null;with_check:string|null}>(
      `SELECT tablename,qual,with_check FROM pg_policies
       WHERE schemaname='public' AND tablename=ANY($1::text[])`,
      [expected]
    );
    assert.equal(policies.rowCount, expected.length);
    for (const table of expected) {
      const policy = policies.rows.find(row => row.tablename === table);
      assert.ok(policy, "missing organization RLS policy for " + table);
      assert.match(policy.qual ?? "", /tpay_current_organization_id/);
      assert.match(policy.with_check ?? "", /tpay_current_organization_id/);
    }
    const closeout = await client.query<{definition:string}>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE conrelid='community_tontine_cycle_closeouts'::regclass
         AND contype='c'`
    );
    assert.ok(closeout.rows.some(row => row.definition.includes("gross_refundable_minor") &&
      row.definition.includes("tpay_commission_minor") &&
      row.definition.includes("microfinance_commission_minor")),
      "closeout must enforce a bounded refund calculation");
    assert.ok(closeout.rows.some(row => row.definition.includes("incident_count")),
      "closeout settlement must be blocked while incidents remain");
    const refund = await client.query<{definition:string}>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE conrelid='community_tontine_cycle_refund_allocations'::regclass
         AND contype='c'`
    );
    assert.ok(refund.rows.some(row => row.definition.includes("net_refund_minor") &&
      row.definition.includes("gross_share_minor")),
      "member refund allocation must enforce non-negative net amount");
  } finally {
    await client.end();
  }
});
