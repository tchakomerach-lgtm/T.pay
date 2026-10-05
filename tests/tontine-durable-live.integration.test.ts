import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("independent tontine PostgreSQL barriers survive real concurrent claims and duplicate receipts", { skip: !databaseUrl && "TPAY_DATABASE_URL is not configured" }, async () => {
  const a = new pg.Client({ connectionString: databaseUrl });
  const b = new pg.Client({ connectionString: databaseUrl });
  const organizationId = randomUUID();
  const groupId = randomUUID();
  const cycleId = randomUUID();
  const membershipId = randomUUID();
  const slotId = randomUUID();
  const callbackId = randomUUID();
  try {
    await a.connect();
    await b.connect();
    await applyMigrations(a, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await a.query("INSERT INTO organizations (id,name,status,created_at) VALUES ($1,$2,'active',now())", [organizationId, "Tontine concurrency test"]);
    await a.query(
      "INSERT INTO tontine_groups (id,organization_id,name,country_code,currency,frequency,contribution_mode,minimum_amount_minor,cycle_number,governance,status,created_by,created_at) VALUES ($1,$2,'Concurrency TG','TG','XOF','daily','fixed',1000,1,'member_vote','active',$3,now())",
      [groupId, organizationId, randomUUID()]
    );
    await a.query(
      "INSERT INTO tontine_cycles (id,organization_id,group_id,cycle_number,starts_on,ends_on,status,rules_version,minimum_amount_minor,currency,created_at) VALUES ($1,$2,$3,1,CURRENT_DATE,CURRENT_DATE,'open','v1',1000,'XOF',now())",
      [cycleId, organizationId, groupId]
    );
    await a.query(
      "INSERT INTO tontine_memberships (id,organization_id,group_id,client_id,role,status,joined_at) VALUES ($1,$2,$3,$4,'member','active',now())",
      [membershipId, organizationId, groupId, randomUUID()]
    );
    await a.query(
      "INSERT INTO tontine_beneficiary_slots (id,organization_id,group_id,cycle_id,cycle_number,sequence,beneficiary_membership_id,amount_target_minor,status,scheduled_for) VALUES ($1,$2,$3,$4,1,1,$5,1000,'scheduled',CURRENT_DATE)",
      [slotId, organizationId, groupId, cycleId, membershipId]
    );

    await Promise.all([a.query("BEGIN"), b.query("BEGIN")]);
    const firstPromise = a.query(
      "UPDATE tontine_beneficiary_slots SET status='eligible' WHERE organization_id=$1 AND cycle_id=$2 AND beneficiary_membership_id=$3 AND status='scheduled' RETURNING id",
      [organizationId, cycleId, membershipId]
    );
    const first = await firstPromise;
    const secondPromise = b.query(
      "UPDATE tontine_beneficiary_slots SET status='eligible' WHERE organization_id=$1 AND cycle_id=$2 AND beneficiary_membership_id=$3 AND status='scheduled' RETURNING id",
      [organizationId, cycleId, membershipId]
    );
    await a.query("COMMIT");
    const second = await secondPromise;
    await b.query("COMMIT");

    assert.equal(first.rowCount, 1);
    assert.equal(second.rowCount, 0);

    await a.query(
      "INSERT INTO tontine_provider_callback_receipts (id,organization_id,provider,provider_event_id,payload_sha256,signature_verified,received_at,state) VALUES ($1,$2,'test-provider','evt-1','hash-1',true,now(),'received')",
      [callbackId, organizationId]
    );
    await assert.rejects(
      a.query(
        "INSERT INTO tontine_provider_callback_receipts (id,organization_id,provider,provider_event_id,payload_sha256,signature_verified,received_at,state) VALUES ($1,$2,'test-provider','evt-1','hash-2',true,now(),'received')",
        [randomUUID(), organizationId]
      )
    );
  } finally {
    await b.end().catch(() => undefined);
    await a.query("DELETE FROM tontine_provider_callback_receipts WHERE organization_id=$1", [organizationId]).catch(() => undefined);
    await a.query("DELETE FROM tontine_beneficiary_slots WHERE organization_id=$1", [organizationId]).catch(() => undefined);
    await a.query("DELETE FROM tontine_member_schedules WHERE organization_id=$1", [organizationId]).catch(() => undefined);
    await a.query("DELETE FROM tontine_memberships WHERE organization_id=$1", [organizationId]).catch(() => undefined);
    await a.query("DELETE FROM tontine_cycles WHERE organization_id=$1", [organizationId]).catch(() => undefined);
    await a.query("DELETE FROM tontine_groups WHERE organization_id=$1", [organizationId]).catch(() => undefined);
    await a.query("DELETE FROM organizations WHERE id=$1", [organizationId]).catch(() => undefined);
    await a.end().catch(() => undefined);
  }
});
