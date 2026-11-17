import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("Community Tontine commercial foreign keys reject cross-organization group and campaign references", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const client = new pg.Client({ connectionString: databaseUrl });
  const orgA = randomUUID(), orgB = randomUUID();
  const groupA = randomUUID(), groupB = randomUUID();
  const actor = randomUUID(), policyId = randomUUID(), campaignId = randomUUID();
  try {
    await client.connect();
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,'Scope A','active',now()),($2,'Scope B','active',now())",[orgA,orgB]);
    const insertGroup = async (id:string, org:string) => client.query(
      "INSERT INTO tontine_groups (id,organization_id,name,country_code,currency,frequency,contribution_mode,minimum_amount_minor,cycle_number,governance,status,created_by,created_at) VALUES ($1,$2,'Scope test','TG','XOF','weekly','fixed',1000,1,'member_vote','active',$3,now())",
      [id,org,actor]
    );
    await insertGroup(groupA,orgA);
    await insertGroup(groupB,orgB);

    const components = JSON.stringify([{recipient:"TPAY",rateBps:100,enabled:true}]);
    const policyValues = [policyId,orgA,groupA,components,"a".repeat(64),actor];
    await client.query(
      `INSERT INTO community_tontine_commission_policies
       (id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,
        effective_from,components,policy_hash,created_by)
       VALUES ($1,$2,$3,'v1','CONTRIBUTION','XOF','DRAFT','MEMBER',10000,now(),$4::jsonb,$5,$6)`,
      policyValues
    );
    await assert.rejects(
      client.query(
        `INSERT INTO community_tontine_commission_policies
         (id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,
          effective_from,components,policy_hash,created_by)
         VALUES ($1,$2,$3,'v2','TRANSFER','XOF','DRAFT','MEMBER',10000,now(),$4::jsonb,$5,$6)`,
        [randomUUID(),orgA,groupB,components,"b".repeat(64),actor]
      ),
      (error:unknown)=>Boolean(error&&typeof error==="object"&&"code" in error&&(error as {code:string}).code==="23503")
    );

    await client.query(
      `INSERT INTO community_tontine_promotion_campaigns
       (id,organization_id,group_id,code,title,state,starts_at,ends_at,currency,reward_minor,max_redemptions,
        accepted_redemptions,max_budget_minor,committed_budget_minor,allowed_channels,created_by)
       VALUES ($1,$2,$3,'SCOPE-A','Scope campaign','DRAFT',now()-interval '1 minute',now()+interval '1 day',
               'XOF',100,1,0,100,0,ARRAY['QR']::text[],$4)`,
      [campaignId,orgA,groupA,actor]
    );
    await assert.rejects(
      client.query(
        `INSERT INTO community_tontine_promotion_redemptions
         (id,organization_id,group_id,campaign_id,candidate_id,channel,state,reward_minor,currency,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,'QR','ATTRIBUTED',100,'XOF',$6)`,
        [randomUUID(),orgA,groupB,campaignId,randomUUID(),"scope-"+randomUUID()]
      ),
      (error:unknown)=>Boolean(error&&typeof error==="object"&&"code" in error&&(error as {code:string}).code==="23503")
    );

    await assert.rejects(
      client.query(
        `INSERT INTO community_tontine_role_grants
         (id,organization_id,group_id,actor_id,role,permissions,granted_by,valid_from,expires_at)
         VALUES ($1,$2,$3,$4,'TREASURER',ARRAY['contribution.read'],$5,now(),now()+interval '1 day')`,
        [randomUUID(),orgA,groupB,randomUUID(),actor]
      ),
      (error:unknown)=>Boolean(error&&typeof error==="object"&&"code" in error&&(error as {code:string}).code==="23503")
    );
  } finally {
    await client.query("DELETE FROM community_tontine_promotion_redemptions WHERE organization_id = ANY($1::uuid[])",[[orgA,orgB]]).catch(()=>undefined);
    await client.query("DELETE FROM community_tontine_promotion_campaigns WHERE organization_id = ANY($1::uuid[])",[[orgA,orgB]]).catch(()=>undefined);
    await client.query("DELETE FROM community_tontine_role_grants WHERE organization_id = ANY($1::uuid[])",[[orgA,orgB]]).catch(()=>undefined);
    await client.query("DELETE FROM community_tontine_commission_policies WHERE organization_id = ANY($1::uuid[])",[[orgA,orgB]]).catch(()=>undefined);
    await client.query("DELETE FROM tontine_groups WHERE organization_id = ANY($1::uuid[])",[[orgA,orgB]]).catch(()=>undefined);
    await client.query("DELETE FROM organizations WHERE id = ANY($1::uuid[])",[[orgA,orgB]]).catch(()=>undefined);
    await client.end().catch(()=>undefined);
  }
});
