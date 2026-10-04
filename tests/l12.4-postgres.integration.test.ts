import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {PostgresOperationalObservabilityRepository} from "../packages/operations/src/observability.js";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("L12.4 PostgreSQL concurrent alert upsert converges to one durable row", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
 const setup=new pg.Client({connectionString:databaseUrl}); const a=new pg.Client({connectionString:databaseUrl}); const b=new pg.Client({connectionString:databaseUrl});
 await Promise.all([setup.connect(),a.connect(),b.connect()]);
 const service="obs-"+randomUUID(); const alertKey="provider-degraded"; const hash="a".repeat(64);
 try{
  await applyMigrations(setup,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const ra=new PostgresOperationalObservabilityRepository(a); const rb=new PostgresOperationalObservabilityRepository(b); const now=new Date().toISOString();
  await Promise.all([
   ra.upsertAlert({id:randomUUID(),service,alertKey,severity:"high",state:"open",firstSeenAt:now,lastSeenAt:now,correlationId:"c-a",evidenceHash:hash}),
   rb.upsertAlert({id:randomUUID(),service,alertKey,severity:"critical",state:"acknowledged",firstSeenAt:now,lastSeenAt:now,correlationId:"c-b",evidenceHash:hash})
  ]);
  const row=await setup.query("SELECT COUNT(*)::int AS count FROM operational_alerts WHERE service=$1 AND alert_key=$2",[service,alertKey]);
  assert.equal(Number(row.rows[0]?.count),1);
 } finally { await setup.query("DELETE FROM operational_alerts WHERE service=$1",[service]); await Promise.all([setup.end(),a.end(),b.end()]); }
});

test("L12.4 alert routing is severity-aware and delivery idempotent", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
 const client=new pg.Client({connectionString:databaseUrl}); await client.connect();
 const repo=new PostgresOperationalObservabilityRepository(client); const routeId=randomUUID(); const deliveryKey="dk-"+randomUUID(); const correlationId=randomUUID(); const hash="b".repeat(64);
 try{
  await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  await client.query("INSERT INTO incident_routes(route_id,channel,destination_ref,minimum_severity,enabled,created_at) VALUES($1,'internal_queue',$2,'high',true,NOW())",[routeId,"ops://l12.4"]);
  assert.equal((await repo.listRoutesForSeverity("critical")).length,1);
  const d={id:randomUUID(),service:"api",alertKey:"api-down",routeId,deliveryKey,channel:"internal_queue" as const,status:"queued" as const,attemptedAt:new Date().toISOString(),correlationId,evidenceHash:hash};
  await repo.queueAlertDelivery(d); await repo.queueAlertDelivery({...d,id:randomUUID()});
  const count=await client.query("SELECT COUNT(*)::int AS count FROM operational_alert_deliveries WHERE route_id=$1 AND delivery_key=$2",[routeId,deliveryKey]);
  assert.equal(Number(count.rows[0]?.count),1);
 } finally { await client.query("DELETE FROM operational_alert_deliveries WHERE route_id=$1",[routeId]); await client.query("DELETE FROM incident_routes WHERE route_id=$1",[routeId]); await client.end(); }
});

test("L12.4 degraded-mode drill records provider outage evidence without mutating ledger", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
 const client=new pg.Client({connectionString:databaseUrl}); await client.connect();
 const repo=new PostgresOperationalObservabilityRepository(client); const id=randomUUID(); const hash="c".repeat(64); const correlationId=randomUUID();
 try{
  await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  await repo.recordDegradedDrill({id,service:"payment-adapter",dependency:"mobile-money-provider",mode:"offline",startedAt:new Date().toISOString(),correlationId,evidenceHash:hash});
  const row=await client.query("SELECT mode FROM operational_degraded_drills WHERE id=$1",[id]); assert.equal(row.rows[0]?.mode,"offline");
  const ledger=await client.query("SELECT to_regclass('public.ledger_entries') AS table_name"); assert.equal(ledger.rows.length,1);
 } finally { await client.query("DELETE FROM operational_degraded_drills WHERE id=$1",[id]); await client.end(); }
});
