import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("Community Tontine commercial migration enforces policy immutability and atomic promotion budget quota", { skip: !databaseUrl }, async () => {
  if (!databaseUrl) return;
  const a = new pg.Client({ connectionString: databaseUrl });
  const b = new pg.Client({ connectionString: databaseUrl });
  const organizationId = randomUUID();
  const groupId = randomUUID();
  const creatorId = randomUUID();
  const approverId = randomUUID();
  const policyId = randomUUID();
  const policyAuditId = randomUUID();
  const campaignId = randomUUID();
  try {
    await a.connect();
    await b.connect();
    await applyMigrations(a, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await a.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',now())", [organizationId, "Tontine commercial test"]);
    await a.query(
      "INSERT INTO tontine_groups (id,organization_id,name,country_code,currency,frequency,contribution_mode,minimum_amount_minor,cycle_number,governance,status,created_by,created_at) VALUES ($1,$2,'Commercial TG','TG','XOF','weekly','fixed',1000,1,'member_vote','active',$3,now())",
      [groupId, organizationId, creatorId]
    );

    const components = JSON.stringify([
      { recipient: "TPAY", rateBps: 100, enabled: true },
      { recipient: "PARTNER", rateBps: 50, enabled: true }
    ]);
    await a.query(
      `INSERT INTO community_tontine_commission_policies
       (id,organization_id,group_id,version,transaction_level,currency,state,payer_mode,member_share_bps,
        effective_from,components,policy_hash,created_by)
       VALUES ($1,$2,$3,'v1','CONTRIBUTION','XOF','DRAFT','SPLIT',6000,now()-interval '1 minute',$4::jsonb,$5,$6)`,
      [policyId,organizationId,groupId,components,"a".repeat(64),creatorId]
    );
    await a.query(
      "UPDATE community_tontine_commission_policies SET state='APPROVED',approved_by=$2 WHERE id=$1",
      [policyId,approverId]
    );
    await a.query(
      "UPDATE community_tontine_commission_policies SET state='ACTIVE',activated_at=now() WHERE id=$1",
      [policyId]
    );
    await assert.rejects(a.query(
      "UPDATE community_tontine_commission_policies SET components='[]'::jsonb WHERE id=$1",
      [policyId]
    ));

    await a.query(
      `INSERT INTO community_tontine_commission_policy_audit
       (id,organization_id,group_id,policy_id,actor_id,action,reason,occurred_at)
       VALUES ($1,$2,$3,$4,$5,'CREATED','audit immutability test',now())`,
      [policyAuditId,organizationId,groupId,policyId,creatorId]
    );
    await assert.rejects(a.query(
      "UPDATE community_tontine_commission_policy_audit SET reason='tampered' WHERE id=$1",
      [policyAuditId]
    ));

    await a.query(
      `INSERT INTO community_tontine_promotion_campaigns
       (id,organization_id,group_id,code,title,state,starts_at,ends_at,currency,reward_minor,max_redemptions,
        accepted_redemptions,max_budget_minor,committed_budget_minor,allowed_channels,created_by)
       VALUES ($1,$2,$3,'RACE1','Quota race','DRAFT',now()-interval '1 minute',now()+interval '1 day',
               'XOF',100,1,0,100,0,ARRAY['QR']::text[],$4)`,
      [campaignId,organizationId,groupId,creatorId]
    );
    await a.query(
      "UPDATE community_tontine_promotion_campaigns SET state='APPROVED',approved_by=$2 WHERE id=$1",
      [campaignId,approverId]
    );
    await a.query(
      "UPDATE community_tontine_promotion_campaigns SET state='ACTIVE' WHERE id=$1",
      [campaignId]
    );

    await Promise.all([a.query("BEGIN"), b.query("BEGIN")]);
    const reserveSql = `UPDATE community_tontine_promotion_campaigns
      SET accepted_redemptions=accepted_redemptions+1,committed_budget_minor=committed_budget_minor+100
      WHERE organization_id=$1 AND group_id=$2 AND id=$3 AND state='ACTIVE'
        AND accepted_redemptions<max_redemptions
        AND committed_budget_minor+100<=max_budget_minor
      RETURNING id`;
    const first = await a.query(reserveSql,[organizationId,groupId,campaignId]);
    const secondPromise = b.query(reserveSql,[organizationId,groupId,campaignId]);
    await a.query("COMMIT");
    const second = await secondPromise;
    await b.query("COMMIT");
    assert.equal(first.rowCount,1);
    assert.equal(second.rowCount,0);
    const final = await a.query(
      "SELECT accepted_redemptions,committed_budget_minor::text FROM community_tontine_promotion_campaigns WHERE id=$1",
      [campaignId]
    );
    assert.equal(Number(final.rows[0]?.accepted_redemptions),1);
    assert.equal(String(final.rows[0]?.committed_budget_minor),"100");
  } finally {
    await b.query("ROLLBACK").catch(() => undefined);
    await a.query("ROLLBACK").catch(() => undefined);
    for (const table of [
      "community_tontine_commission_policy_audit",
      "community_tontine_commission_policies",
      "community_tontine_promotion_campaigns"
    ]) await a.query(`ALTER TABLE ${table} DISABLE TRIGGER ALL`).catch(() => undefined);
    await a.query("DELETE FROM community_tontine_commission_policy_audit WHERE organization_id=$1",[organizationId]).catch(() => undefined);
    await a.query("DELETE FROM community_tontine_commission_policies WHERE organization_id=$1",[organizationId]).catch(() => undefined);
    await a.query("DELETE FROM community_tontine_promotion_campaigns WHERE organization_id=$1",[organizationId]).catch(() => undefined);
    await a.query("DELETE FROM tontine_groups WHERE organization_id=$1",[organizationId]).catch(() => undefined);
    await a.query("DELETE FROM organizations WHERE id=$1",[organizationId]).catch(() => undefined);
    await a.end().catch(() => undefined);
    await b.end().catch(() => undefined);
  }
});
