import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("L14.5 commerce tables enforce tenant isolation and idempotent campaign actions", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const offerA = randomUUID();
  const campaignA = randomUUID();
  const leadA = randomUUID();
  const actionA = randomUUID();
  const now = "2026-10-05T00:00:00.000Z";
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query(
      "INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3),($4,$5,'active',$3)",
      [orgA,"commerce A",now,orgB,"commerce B"]
    );
    await client.query(
      "INSERT INTO commercial_offers (id,organization_id,owner_user_id,title,description,category,currency,active,created_at,updated_at) VALUES ($1,$2,$3,'Service local','Offre test','service','XOF',true,$4,$4)",
      [offerA,orgA,randomUUID(),now]
    );
    await client.query(
      "INSERT INTO commercial_campaigns (id,organization_id,offer_id,status,daily_outbound_limit,sent_today,created_at,updated_at) VALUES ($1,$2,$3,'active',10,0,$4,$4)",
      [campaignA,orgA,offerA,now]
    );
    await client.query(
      "INSERT INTO commercial_leads (id,organization_id,source,contact_ref,need,score,consent,created_at,updated_at) VALUES ($1,$2,'tpay','contact-a','besoin',90,'granted',$3,$3)",
      [leadA,orgA,now]
    );
    await client.query(
      "INSERT INTO commercial_actions (id,organization_id,campaign_id,lead_id,action,channel,state,idempotency_key,created_at) VALUES ($1,$2,$3,$4,'prepare_follow_up','tpay','planned','idem-commerce-1',$5)",
      [actionA,orgA,campaignA,leadA,now]
    );
    await assert.rejects(() => client.query(
      "INSERT INTO commercial_actions (id,organization_id,campaign_id,lead_id,action,channel,state,idempotency_key,created_at) VALUES ($1,$2,$3,$4,'prepare_follow_up','tpay','planned','idem-commerce-1',$5)",
      [randomUUID(),orgA,campaignA,leadA,now]
    ));
    await client.query(
      "INSERT INTO commercial_actions (id,organization_id,campaign_id,action,channel,state,idempotency_key,created_at) VALUES ($1,$2,$3,'discover_lead','tpay','planned','idem-commerce-1',$4)",
      [randomUUID(),orgB,campaignA,now]
    );
    const counts = await client.query(
      "SELECT organization_id,count(*)::int AS count FROM commercial_actions WHERE idempotency_key='idem-commerce-1' GROUP BY organization_id ORDER BY organization_id"
    );
    assert.equal(counts.rows.length,2);
    assert.deepEqual(counts.rows.map(r => r.count),[1,1]);
  } finally {
    await client.query("DELETE FROM commercial_actions WHERE organization_id IN ($1,$2)",[orgA,orgB]);
    await client.query("DELETE FROM commercial_leads WHERE organization_id IN ($1,$2)",[orgA,orgB]);
    await client.query("DELETE FROM commercial_campaigns WHERE organization_id IN ($1,$2)",[orgA,orgB]);
    await client.query("DELETE FROM commercial_offers WHERE organization_id IN ($1,$2)",[orgA,orgB]);
    await client.query("DELETE FROM organizations WHERE id IN ($1,$2)",[orgA,orgB]);
    await client.end();
  }
});
