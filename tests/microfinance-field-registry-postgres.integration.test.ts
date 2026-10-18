import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("MF field registry migration prevents cross-organization handover items and is rerunnable", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured",
}, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const customerA = randomUUID();
  const customerB = randomUUID();
  const handoverId = randomUUID();
  const actorId = randomUUID();
  const sourceAgentId = randomUUID();
  const targetAgentId = randomUUID();
  try {
    const migrationsUrl = pathToFileURL(join(process.cwd(), "migrations") + "/");
    await applyMigrations(client, migrationsUrl);
    await applyMigrations(client, migrationsUrl);

    await client.query(
      "INSERT INTO organizations (id, name, status, created_at) VALUES ($1, $2, $3, now()), ($4, $5, $3, now())",
      [organizationA, "MF field test A", "active", organizationB, "MF field test B"],
    );
    await client.query(
      "INSERT INTO customer_field_profiles (organization_id, customer_id) VALUES ($1, $2), ($3, $4)",
      [organizationA, customerA, organizationB, customerB],
    );
    await client.query(
      "INSERT INTO customer_field_handover_cases (id, organization_id, source_agent_id, target_agent_id, status, reason, plan_hash, plan_expires_at, proposed_by) VALUES ($1, $2, $3, $4, 'proposed', 'agent_unavailable', $5, now() + interval '10 minutes', $6)",
      [handoverId, organizationA, sourceAgentId, targetAgentId, "a".repeat(64), actorId],
    );

    // A handover from organization A must never be attachable to a customer in B.
    await assert.rejects(
      client.query(
        "INSERT INTO customer_field_handover_items (organization_id, handover_id, customer_id, next_agent_id, distance_km, item_plan_hash) VALUES ($1, $2, $3, $4, 1.2, $5)",
        [organizationB, handoverId, customerB, targetAgentId, "b".repeat(64)],
      ),
      { code: "23503" },
    );

    // A same-tenant item is valid; this also proves the composite FK does not over-block.
    await client.query(
      "INSERT INTO customer_field_handover_items (organization_id, handover_id, customer_id, next_agent_id, distance_km, item_plan_hash) VALUES ($1, $2, $3, $4, 1.2, $5)",
      [organizationA, handoverId, customerA, targetAgentId, "c".repeat(64)],
    );
  } finally {
    await client.query("DELETE FROM customer_field_handover_items WHERE handover_id = $1", [handoverId]);
    await client.query("DELETE FROM customer_field_handover_cases WHERE id = $1", [handoverId]);
    await client.query("DELETE FROM customer_field_profiles WHERE organization_id IN ($1, $2)", [organizationA, organizationB]);
    await client.query("DELETE FROM organizations WHERE id IN ($1, $2)", [organizationA, organizationB]);
    await client.end();
  }
});
