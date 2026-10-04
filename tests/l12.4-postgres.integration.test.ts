import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {PostgresOperationalObservabilityRepository} from "../packages/operations/src/observability.js";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("L12.4 PostgreSQL concurrent alert upsert has one durable state", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const setup=new pg.Client({connectionString:databaseUrl});
  const a=new pg.Client({connectionString:databaseUrl});
  const b=new pg.Client({connectionString:databaseUrl});
  await Promise.all([setup.connect(),a.connect(),b.connect()]);
  const service="api"; const alertKey="degraded-"+randomUUID(); const now=new Date().toISOString();
  const hash="a".repeat(64);
  try{
    await applyMigrations(setup,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    const ra=new PostgresOperationalObservabilityRepository(a);
    const rb=new PostgresOperationalObservabilityRepository(b);
    await Promise.all([
      ra.upsertAlert({id:randomUUID(),service,alertKey,severity:"high",state:"open",firstSeenAt:now,lastSeenAt:now,evidenceHash:hash}),
      rb.upsertAlert({id:randomUUID(),service,alertKey,severity:"critical",state:"acknowledged",firstSeenAt:now,lastSeenAt:now,evidenceHash:hash})
    ]);
    const row=await setup.query("SELECT count(*)::int AS count, service, alert_key FROM operational_alerts WHERE service=$1 AND alert_key=$2 GROUP BY service,alert_key",[service,alertKey]);
    assert.equal(row.rows[0]?.count,1);
    assert.equal(row.rows[0]?.service,service);
    assert.equal(row.rows[0]?.alert_key,alertKey);
  } finally {
    await setup.query("DELETE FROM operational_alert_deliveries WHERE service=$1 AND alert_key=$2",[service,alertKey]);
    await setup.query("DELETE FROM operational_alerts WHERE service=$1 AND alert_key=$2",[service,alertKey]);
    await Promise.all([setup.end(),a.end(),b.end()]);
  }
});

test("L12.4 alert delivery reuses L12.3 incident routes with tenant-independent operational evidence", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
  const client=new pg.Client({connectionString:databaseUrl}); await client.connect();
  const routeId=randomUUID(), deliveryId=randomUUID(), incidentId=randomUUID(), now=new Date().toISOString();
  const deliveryKey="alert-"+randomUUID(), hash="c".repeat(64);
  try{
    await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
    await client.query("INSERT INTO incident_routes(route_id,channel,destination_ref,minimum_severity,enabled,created_at) VALUES($1,'internal_queue',$2,'high',true,$3::timestamptz)",[routeId,"ops-l12.4-"+randomUUID(),now]);
    await client.query("INSERT INTO operational_alert_deliveries(id,service,alert_key,route_id,delivery_key,status,attempted_at,evidence_hash) VALUES($1,$2,$3,$4,$5,'queued',$6::timestamptz,$7)",[deliveryId,"api","provider-degraded",routeId,deliveryKey,now,hash]);
    const row=await client.query("SELECT route_id,status FROM operational_alert_deliveries WHERE id=$1",[deliveryId]);
    assert.equal(row.rows[0]?.route_id,routeId); assert.equal(row.rows[0]?.status,"queued");
  } finally {
    await client.query("DELETE FROM operational_alert_deliveries WHERE id=$1",[deliveryId]);
    await client.query("DELETE FROM incident_routes WHERE route_id=$1",[routeId]);
    await client.end();
  }
});
