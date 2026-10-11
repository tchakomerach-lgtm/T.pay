import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("Super Admin control-plane migration is idempotent and enforces bounded privileged state", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const privilegedId = randomUUID();
  const grantId = randomUUID();
  const recoveryId = randomUUID();
  const now = new Date("2026-10-07T05:00:00.000Z");
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));

    await client.query(
      "INSERT INTO tpay_privileged_identities(id,human_user_id,privileged_level,device_id,assurance,active,expires_at) VALUES($1,$2,$3,$4,$5,true,$6)",
      [privilegedId, "test-admin", "L4_SUPER_ADMIN", "test-device", "HARDWARE_KEY", new Date(now.getTime() + 10 * 60_000)]
    );

    await client.query(
      "INSERT INTO tpay_privileged_grants(id,principal_id,resource,action,justification,issued_at,expires_at,one_shot,approval_count,required_approvals) VALUES($1,$2,$3,$4,$5,$6,$7,true,2,2)",
      [grantId, privilegedId, "recovery/ledger", "verify", "live recovery verification", now, new Date(now.getTime() + 5 * 60_000)]
    );

    await client.query(
      "INSERT INTO tpay_recovery_runs(id,incident_id,state,started_at,last_transition_at,evidence_digest) VALUES($1,$2,$3,$4,$4,$5)",
      [recoveryId, "incident-live-1", "VERIFICATION", now, "a".repeat(64)]
    );

    const counts = await client.query(
      "SELECT " +
      "(SELECT count(*) FROM tpay_privileged_identities WHERE id=$1)::int AS identities, " +
      "(SELECT count(*) FROM tpay_privileged_grants WHERE id=$2)::int AS grants, " +
      "(SELECT count(*) FROM tpay_recovery_runs WHERE id=$3)::int AS recovery",
      [privilegedId, grantId, recoveryId]
    );
    assert.deepEqual(counts.rows[0], { identities: 1, grants: 1, recovery: 1 });

    await assert.rejects(() => client.query(
      "INSERT INTO tpay_privileged_grants(id,principal_id,resource,action,justification,issued_at,expires_at,one_shot,approval_count,required_approvals) VALUES($1,$2,$3,$4,$5,$6,$7,true,3,2)",
      [randomUUID(), privilegedId, "recovery/ledger", "verify", "invalid approval count", now, new Date(now.getTime() + 5 * 60_000)]
    ));

    await client.query("DELETE FROM tpay_recovery_runs WHERE id=$1", [recoveryId]);
    await client.query("DELETE FROM tpay_privileged_grants WHERE id=$1", [grantId]);
    await client.query("DELETE FROM tpay_privileged_identities WHERE id=$1", [privilegedId]);
  } finally {
    await client.query("DELETE FROM tpay_recovery_approvals WHERE recovery_run_id=$1", [recoveryId]).catch(() => undefined);
    await client.query("DELETE FROM tpay_recovery_runs WHERE id=$1", [recoveryId]).catch(() => undefined);
    await client.query("DELETE FROM tpay_privileged_grants WHERE id=$1", [grantId]).catch(() => undefined);
    await client.query("DELETE FROM tpay_privileged_identities WHERE id=$1", [privilegedId]).catch(() => undefined);
    await client.end();
  }
});
