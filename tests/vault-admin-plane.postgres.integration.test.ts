import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl = process.env.TPAY_DATABASE_URL;

test("Fortress Admin Plane RLS is isolated from User Plane and vault audit is append-only", {
  skip: !databaseUrl && "TPAY_DATABASE_URL is not configured"
}, async () => {
  const client = new pg.Client({ connectionString: databaseUrl });
  const parentVaultId = randomUUID();
  const adminVaultId = randomUUID();
  const userVaultId = randomUUID();
  const actorId = randomUUID();
  const auditId = randomUUID();
  const adminSessionId = randomUUID();
  const userRole = "tpay_vault_user_" + randomUUID().replaceAll("-", "");
  await client.connect();
  try {
    await applyMigrations(client, pathToFileURL(join(process.cwd(), "migrations") + "/"));
    await client.query(`CREATE ROLE "${userRole}" NOLOGIN NOSUPERUSER NOBYPASSRLS`);
    await client.query(`GRANT SELECT ON tpay_vaults TO "${userRole}"`);

    await client.query("BEGIN");
    await client.query(
      "INSERT INTO tpay_vaults(id,tenant_id,organization_id,parent_vault_id,owner_actor_id,vault_class,module_code) VALUES($1,'__platform__',NULL,NULL,NULL,'administrator','admin-root')",
      [parentVaultId]
    );
    await client.query(
      "INSERT INTO tpay_vaults(id,tenant_id,organization_id,parent_vault_id,owner_actor_id,vault_class,module_code) VALUES($1,'__platform__',NULL,$2,NULL,'super_admin','super-admin')",
      [adminVaultId, parentVaultId]
    );
    await client.query(
      "INSERT INTO tpay_vaults(id,tenant_id,organization_id,parent_vault_id,owner_actor_id,vault_class,module_code) VALUES($1,'tenant-a','org-a',NULL,$2,'finance','finance')",
      [userVaultId, actorId]
    );
    await client.query(
      "INSERT INTO tpay_vault_access_grants(id,vault_id,actor_id,permission,granted_by,valid_from,valid_until) VALUES($1,$2,$3,'read',$3,now()-interval '1 minute',now()+interval '10 minutes')",
      [randomUUID(),adminVaultId,actorId]
    );

    await client.query("SET LOCAL ROLE tpay_admin_runtime");
    await client.query("SELECT set_config('tpay.actor_id',$1,true)", [actorId]);
    await client.query("SELECT set_config('tpay.permission','read',true)");
    await client.query("SELECT set_config('tpay.privileged_session_id',$1,true)", [adminSessionId]);
    await client.query("SELECT set_config('tpay.tenant_id','__platform__',true)");
    await client.query("SELECT set_config('tpay.vault_id',$1,true)", [adminVaultId]);
    const adminRows = await client.query("SELECT id FROM tpay_vaults WHERE id IN ($1,$2) ORDER BY id", [adminVaultId,userVaultId]);
    assert.deepEqual(adminRows.rows.map(row => String(row.id)), [adminVaultId]);

    await client.query(
      "INSERT INTO tpay_vault_audit(id,tenant_id,vault_id,actor_id,action,correlation_id) VALUES($1,'__platform__',$2,$3,'open','fortress-isolation-test')",
      [auditId,adminVaultId,actorId]
    );
    await client.query("SAVEPOINT audit_mutation");
    await assert.rejects(() => client.query(
      "UPDATE tpay_vault_audit SET reason_code='tampered' WHERE id=$1",
      [auditId]
    ));
    await client.query("ROLLBACK TO SAVEPOINT audit_mutation");

    await client.query("RESET ROLE");
    await client.query("SET LOCAL ROLE \"" + userRole + "\"");
    await client.query("SELECT set_config('tpay.tenant_id','__platform__',true)");
    await client.query("SELECT set_config('tpay.vault_id',$1,true)", [adminVaultId]);
    const deniedAdminRows = await client.query("SELECT id FROM tpay_vaults WHERE id=$1", [adminVaultId]);
    assert.equal(deniedAdminRows.rowCount, 0);

    await client.query("SELECT set_config('tpay.tenant_id','tenant-a',true)");
    await client.query("SELECT set_config('tpay.vault_id',$1,true)", [userVaultId]);
    const userRows = await client.query("SELECT id FROM tpay_vaults WHERE id=$1", [userVaultId]);
    assert.equal(userRows.rowCount, 1);

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.query("REVOKE SELECT ON tpay_vaults FROM \"" + userRole + "\"").catch(() => undefined);
    await client.query("DROP ROLE IF EXISTS \"" + userRole + "\"").catch(() => undefined);
    await client.end();
  }
});
