import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Client } from "pg";

function checksum(sql:string):string{return createHash("sha256").update(sql).digest("hex");}

export async function applyMigrations(client:Client,migrationDirectory:URL):Promise<void>{
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
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
  }catch(error){
    if(String(error).includes("relation \"deployment_locks\" does not exist")){
      // L12.2/029 creates the lock table; bootstrap legacy installations before 029.
    }else throw error;
  }

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
