import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("P056.3 live PostgreSQL only exposes permission grants inside their validity window", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const tenantId = "p0563-" + randomUUID();
  const organizationId = randomUUID();
  const actorId = randomUUID();
  const grantIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  try {
    await client.connect();
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const now = new Date();
    const activeFrom = new Date(now.getTime() - 60_000).toISOString();
    const futureFrom = new Date(now.getTime() + 60_000).toISOString();
    const expiredFrom = new Date(now.getTime() - 120_000).toISOString();
    const expiredUntil = new Date(now.getTime() - 60_000).toISOString();

    await client.query(
      `INSERT INTO api_actor_permissions
       (grant_id,tenant_id,organization_id,actor_id,permission,granted_at,valid_from,valid_until,revoked_at,grant_reason)
       VALUES
       ($1,$5,$6,$7,'org.read',$8,$8,NULL,NULL,'active grant'),
       ($2,$5,$6,$7,'org.manage',$9,$9,NULL,NULL,'future grant'),
       ($3,$5,$6,$7,'finance.read',$10,$10,$11,NULL,'expired grant'),
       ($4,$5,$6,$7,'finance.initiate',$8,$8,NULL,$12,'revoked grant')`,
      [grantIds[0], grantIds[1], grantIds[2], grantIds[3], tenantId, organizationId, actorId,
       activeFrom, futureFrom, expiredFrom, expiredUntil, now.toISOString()]
    );

    const effective = await client.query(
      `SELECT DISTINCT permission FROM api_actor_permissions
        WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3
          AND valid_from <= $4::timestamptz
          AND (valid_until IS NULL OR valid_until > $4::timestamptz)
          AND revoked_at IS NULL
        ORDER BY permission`,
      [tenantId, organizationId, actorId, now.toISOString()]
    );
    assert.deepEqual(effective.rows.map(row => row.permission), ["org.read"]);

    const history = await client.query(
      "SELECT count(*)::int AS count FROM api_actor_permissions WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3",
      [tenantId, organizationId, actorId]
    );
    assert.equal(history.rows[0]?.count, 4);
  } finally {
    await client.query("DELETE FROM api_actor_permissions WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3", [tenantId, organizationId, actorId]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
});
