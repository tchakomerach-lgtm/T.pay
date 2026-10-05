import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("L16 live PostgreSQL: concurrent voice appointments have exactly one winner", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const setup = new pg.Client({ connectionString: databaseUrl });
  await setup.connect();
  const a = new pg.Client({ connectionString: databaseUrl });
  const b = new pg.Client({ connectionString: databaseUrl });
  await a.connect(); await b.connect();
  const organizationId = "voice-it-" + randomUUID();
  const resourceId = "resource-" + randomUUID();
  try {
    await applyMigrations(setup, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    const start = new Date(Date.now() + 60_000);
    const end = new Date(start.getTime() + 30 * 60_000);
    const sql = "INSERT INTO voice_appointments (id,organization_id,resource_id,starts_at,ends_at,status,channel,idempotency_key) VALUES ($1,$2,$3,$4,$5,'confirmed','web',$6)";
    await Promise.all([a.query("BEGIN"), b.query("BEGIN")]);
    const results = await Promise.allSettled([
      a.query(sql, [randomUUID(), organizationId, resourceId, start, end, "idem-a"]),
      b.query(sql, [randomUUID(), organizationId, resourceId, start, end, "idem-b"]),
    ]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const rejected = results.filter(r => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason?.code, "23P01");
    await Promise.all([a.query("COMMIT"), b.query("ROLLBACK")]);
    const count = await setup.query("SELECT count(*)::int AS count FROM voice_appointments WHERE organization_id=$1 AND resource_id=$2 AND status='confirmed'", [organizationId, resourceId]);
    assert.equal(count.rows[0]?.count, 1);
    const eventId = "evt-" + randomUUID();
    const hash = "a".repeat(64);
    const claim = "INSERT INTO voice_provider_callback_claims (organization_id,provider_id,event_id,payload_sha256,first_received_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT DO NOTHING";
    assert.equal((await setup.query(claim, [organizationId, "sandbox", eventId, hash])).rowCount, 1);
    assert.equal((await setup.query(claim, [organizationId, "sandbox", eventId, hash])).rowCount, 0);
  } finally {
    await setup.query("DELETE FROM voice_appointments WHERE organization_id=$1", [organizationId]);
    await setup.query("DELETE FROM voice_provider_callback_claims WHERE organization_id=$1", [organizationId]);
    await Promise.all([a.end(), b.end(), setup.end()]);
  }
}, { timeout: 30_000 });
