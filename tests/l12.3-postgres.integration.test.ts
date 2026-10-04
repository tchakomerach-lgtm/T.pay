import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {PostgresProductionOpsRepository} from "../packages/operations/src/production-ops.js";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("L12.3 PostgreSQL deployment lock admits exactly one concurrent owner", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const setup=new pg.Client({connectionString:databaseUrl});
  const a=new pg.Client({connectionString:databaseUrl});
  const b=new pg.Client({connectionString:databaseUrl});
  await Promise.all([setup.connect(),a.connect(),b.connect()]);
  const lockName="l12.3-"+randomUUID();
  const acquiredAt=new Date().toISOString();
  const leaseUntil=new Date(Date.now()+60000).toISOString();
  try{
    await applyMigrations(setup,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    const ra=new PostgresProductionOpsRepository(a);
    const rb=new PostgresProductionOpsRepository(b);
    const results=await Promise.all([
      ra.acquireDeploymentLock(lockName,"worker-a",leaseUntil,acquiredAt),
      rb.acquireDeploymentLock(lockName,"worker-b",leaseUntil,acquiredAt)
    ]);
    assert.deepEqual(results.sort(),[false,true]);
    const owner=await setup.query("SELECT owner_id FROM deployment_locks WHERE lock_name=$1",[lockName]);
    assert.equal(owner.rows.length,1);
    assert.ok(["worker-a","worker-b"].includes(owner.rows[0]?.owner_id));
  } finally {
    await setup.query("DELETE FROM deployment_locks WHERE lock_name=$1",[lockName]);
    await Promise.all([setup.end(),a.end(),b.end()]);
  }
});
