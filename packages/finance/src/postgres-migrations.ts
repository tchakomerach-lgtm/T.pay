import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "pg";

function checksum(sql:string):string{return createHash("sha256").update(sql).digest("hex");}

const LEGACY_FORTRESS_MIGRATIONS = new Set([
  "054_fortress_user_rls_hardening.sql",
  "055_fortress_user_data_objects.sql",
  "056_fortress_admin_user_data_rls.sql"
]);

/**
 * The 047 foundation replaced the older fortress_vaults schema with tpay_vaults.
 * The 054–056 migrations target the retired schema and must only run on databases
 * that still contain it. The replacement vault tables already have their own RLS
 * policies and encrypted-object storage in migration 047.
 */
export function isSupersededLegacyFortressMigration(
  file:string,
  legacySchemaExists:boolean,
  currentSchemaExists:boolean
):boolean{
  return LEGACY_FORTRESS_MIGRATIONS.has(file) && currentSchemaExists && !legacySchemaExists;
}

export async function applyMigrations(client:Client,migrationDirectory:URL):Promise<void>{
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), checksum text, applied_by text)");
  await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
  await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS applied_by text");
  await client.query("CREATE TABLE IF NOT EXISTS deployment_locks (lock_name text PRIMARY KEY,owner_id text NOT NULL,lease_until timestamptz NOT NULL,acquired_at timestamptz NOT NULL,CHECK (lease_until > acquired_at))");
  const files=(await readdir(migrationDirectory)).filter(file=>/^\d+_.+\.sql$/.test(file)).sort();
  const ownerId="migration-"+randomUUID();
  let locked=false;
  try{
    const lock=await client.query<{acquired:boolean}>(
      "INSERT INTO deployment_locks(lock_name,owner_id,lease_until,acquired_at) VALUES($1,$2,now()+interval '5 minutes',now()) ON CONFLICT(lock_name) DO UPDATE SET owner_id=EXCLUDED.owner_id,lease_until=EXCLUDED.lease_until,acquired_at=EXCLUDED.acquired_at WHERE deployment_locks.lease_until <= now() RETURNING true AS acquired",
      ["schema-migrations",ownerId]
    );
    locked=lock.rows.length===1;
    if(!locked) throw new Error("MIGRATION_LOCK_BUSY");
  }catch(error){ throw error; }

  try{
    for(const file of files){
      const version=file.slice(0,file.indexOf("_"));
      const sql=await readFile(join(migrationDirectory.pathname,file),"utf8");
      const digest=checksum(sql);
      const existing=await client.query<{version:string;checksum?:string|null}>(
        "SELECT version,checksum FROM schema_migrations WHERE version=$1",[version]
      );
      if(existing.rowCount!==0){
        if(existing.rows[0]?.checksum && existing.rows[0].checksum!==digest) throw new Error("MIGRATION_CHECKSUM_MISMATCH:"+version);
        if(!existing.rows[0]?.checksum){
          await client.query("UPDATE schema_migrations SET checksum=$2,applied_by=COALESCE(applied_by,'legacy-backfill') WHERE version=$1",[version,digest]);
        }
        continue;
      }

      if(LEGACY_FORTRESS_MIGRATIONS.has(file)){
        const schema=await client.query<{legacy_schema_exists:boolean;current_schema_exists:boolean}>(
          "SELECT to_regclass('public.fortress_vaults') IS NOT NULL AS legacy_schema_exists, to_regclass('public.tpay_vaults') IS NOT NULL AS current_schema_exists"
        );
        const legacyExists=schema.rows[0]?.legacy_schema_exists===true;
        const currentExists=schema.rows[0]?.current_schema_exists===true;
        if(isSupersededLegacyFortressMigration(file,legacyExists,currentExists)){
          await client.query(
            "INSERT INTO schema_migrations(version,checksum,applied_by) VALUES($1,$2,$3)",
            [version,digest,"compatibility-skip:047_tpay_vault_fortress"]
          );
          continue;
        }
      }

      await client.query("BEGIN");
      try{
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version,checksum,applied_by) VALUES($1,$2,$3)",[version,digest,ownerId]);
        await client.query("COMMIT");
      }catch(error){
        await client.query("ROLLBACK");
        throw error;
      }
    }
  }finally{
    if(locked) await client.query("DELETE FROM deployment_locks WHERE lock_name=$1 AND owner_id=$2",["schema-migrations",ownerId]);
  }
}
