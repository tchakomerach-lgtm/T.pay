import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P056.5 subject catalog enforces tenant and organization RLS on PostgreSQL",
 {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"},async()=>{
  const client=new pg.Client({connectionString:databaseUrl});
  const tenantA="p0565-a-"+randomUUID(),tenantB="p0565-b-"+randomUUID();
  const orgA="p0565-org-a-"+randomUUID(),orgB="p0565-org-b-"+randomUUID();
  const actorA="director-"+randomUUID(),actorB="director-"+randomUUID();
  const codeA="M"+randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();
  const codeB="S"+randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();
  try{
   await client.connect();
   await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
   await client.query(
    "INSERT INTO education_actors(actor_id,tenant_id,organization_id,kind,active) VALUES($1,$2,$3,'DIRECTOR',true),($4,$5,$6,'DIRECTOR',true)",
    [actorA,tenantA,orgA,actorB,tenantB,orgB]
   );
   await client.query("BEGIN");
   await client.query("SET LOCAL ROLE tpay_school_runtime");
   await client.query("SELECT set_config('tpay.tenant_id',$1,true),set_config('tpay.organization_id',$2,true)",[tenantA,orgA]);
   await client.query(
    "INSERT INTO education_subjects(tenant_id,organization_id,subject_code,name,coefficient,created_by) VALUES($1,$2,$3,'Mathematics',2,$4)",
    [tenantA,orgA,codeA,actorA]
   );
   const own=await client.query("SELECT subject_code FROM education_subjects WHERE tenant_id=$1 AND organization_id=$2",[tenantA,orgA]);
   assert.equal(own.rowCount,1);
   const hidden=await client.query("SELECT subject_code FROM education_subjects WHERE tenant_id=$1 AND organization_id=$2",[tenantB,orgB]);
   assert.equal(hidden.rowCount,0);
   await assert.rejects(
    client.query("INSERT INTO education_subjects(tenant_id,organization_id,subject_code,name,coefficient,created_by) VALUES($1,$2,$3,'Science',1,$4)",[tenantB,orgB,codeB,actorB]),
    /row-level security|policy/i
   );
   await client.query("ROLLBACK");
  }finally{
   await client.query("ROLLBACK").catch(()=>undefined);
   await client.query("DELETE FROM education_subjects WHERE (tenant_id=$1 AND organization_id=$2) OR (tenant_id=$3 AND organization_id=$4)",[tenantA,orgA,tenantB,orgB]).catch(()=>undefined);
   await client.query("DELETE FROM education_actors WHERE actor_id IN ($1,$2)",[actorA,actorB]).catch(()=>undefined);
   await client.end().catch(()=>undefined);
  }
});
