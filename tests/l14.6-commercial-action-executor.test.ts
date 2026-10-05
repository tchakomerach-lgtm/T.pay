import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { PostgresCommercialActionStore } from "../packages/revenue/src/postgres-commercial-actions.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("L14.6 only one worker claims a commercial action", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const setup = new pg.Client({ connectionString: databaseUrl });
  const workerA = new pg.Client({ connectionString: databaseUrl });
  const workerB = new pg.Client({ connectionString: databaseUrl });
  await setup.connect(); await workerA.connect(); await workerB.connect();
  const organizationId=randomUUID(), offerId=randomUUID(), campaignId=randomUUID(), actionId=randomUUID(), now="2026-10-05T01:00:00.000Z";
  try {
    await applyMigrations(setup,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    await setup.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',$3)",[organizationId,"L14.6",now]);
    await setup.query("INSERT INTO commercial_offers (id,organization_id,owner_user_id,title,description,category,currency,active,created_at,updated_at) VALUES ($1,$2,$3,'Offer','Offer','service','XOF',true,$4,$4)",[offerId,organizationId,randomUUID(),now]);
    await setup.query("INSERT INTO commercial_campaigns (id,organization_id,offer_id,status,daily_outbound_limit,sent_today,created_at,updated_at) VALUES ($1,$2,$3,'active',10,0,$4,$4)",[campaignId,organizationId,offerId,now]);
    await setup.query("INSERT INTO commercial_actions (id,organization_id,campaign_id,action,channel,state,idempotency_key,created_at) VALUES ($1,$2,$3,'prepare_follow_up','tpay','planned','l146-'+randomUUID(),$4)",[actionId,organizationId,campaignId,now]);
    const a=new PostgresCommercialActionStore(workerA), b=new PostgresCommercialActionStore(workerB);
    const results=await Promise.all([a.claimDue(organizationId,now,"worker-a"),b.claimDue(organizationId,now,"worker-b")]);
    assert.equal(results.filter(Boolean).length,1);
    const claimed=results.find(Boolean);
    assert.ok(claimed);
    const wrong=claimed?.id===actionId ? (claimed ? "worker-b":"worker-a") : "worker-a";
    await assert.rejects(async()=> {
      if (wrong==="worker-a") await a.markCompleted(actionId,wrong,"2026-10-05T01:01:00.000Z");
      else await b.markCompleted(actionId,wrong,"2026-10-05T01:01:00.000Z");
    },/COMMERCIAL_ACTION_COMPLETE_REJECTED/);
  } finally {
    await setup.query("DELETE FROM commercial_actions WHERE organization_id=$1",[organizationId]);
    await setup.query("DELETE FROM commercial_campaigns WHERE organization_id=$1",[organizationId]);
    await setup.query("DELETE FROM commercial_offers WHERE organization_id=$1",[organizationId]);
    await setup.query("DELETE FROM organizations WHERE id=$1",[organizationId]);
    await Promise.all([setup.end(),workerA.end(),workerB.end()]);
  }
});
