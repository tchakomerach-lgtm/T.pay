import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { PostgresEducationSyncStore } from "../packages/education/src/postgres-sync-fabric.js";
import { computeSyncPayloadHash } from "../packages/education/src/sync-fabric.js";
import type { SyncEvent } from "../packages/education/src/sync-fabric.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;
function event(tenantId:string,organizationId:string,deviceId:string,sequence:bigint,payload:unknown,idempotencyKey:string):SyncEvent{
  return {eventId:randomUUID(),tenantId,organizationId,deviceId,actorId:"actor-1",sequence,occurredAt:new Date().toISOString(),eventType:"school.attendance.recorded",priority:"P1",payload,payloadHash:computeSyncPayloadHash(payload),idempotencyKey,schemaVersion:1};
}

test("P038 PostgreSQL durable sync enforces ordering, idempotency and outbox atomicity",{skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"},async()=>{
 const a=new pg.Client({connectionString:databaseUrl}), b=new pg.Client({connectionString:databaseUrl}); await a.connect(); await b.connect();
 const tenant=randomUUID(),org=randomUUID(),device="dev-"+randomUUID(),now=new Date().toISOString();
 try{
  await applyMigrations(a,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const store=new PostgresEducationSyncStore(a);
  const e2=event(tenant,org,device,2n,{studentId:"s2"},"sync-"+randomUUID());
  const pending=await store.accept(e2); assert.equal(pending.state,"PENDING");
  const e1=event(tenant,org,device,1n,{studentId:"s1"},"sync-"+randomUUID());
  const accepted=await store.accept(e1); assert.equal(accepted.state,"ACCEPTED"); assert.equal(accepted.drainedPending,1); assert.equal(accepted.acceptedSequence,2n);
  const counts=await a.query("SELECT (SELECT count(*) FROM education_sync_inbox WHERE organization_id=$1 AND state='ACCEPTED')::int inbox,(SELECT count(*) FROM education_sync_outbox WHERE organization_id=$1)::int outbox",( [org] ));
  assert.deepEqual(counts.rows[0],{inbox:2,outbox:2});
  const dup=await store.accept({...e1}); assert.equal(dup.state,"DUPLICATE");
  await assert.rejects(()=>store.accept({...e2,payload:{studentId:"tampered"}}),/SYNC_PAYLOAD_HASH_MISMATCH/);

  const e3a=event(tenant,org,device,3n,{studentId:"s3"},"sync-"+randomUUID());
  const e3b=event(tenant,org,device,3n,{studentId:"s3-other"},"sync-"+randomUUID());
  const [r1,r2]=await Promise.all([new PostgresEducationSyncStore(a).accept(e3a),new PostgresEducationSyncStore(b).accept(e3b)]);
  assert.deepEqual([r1.state,r2.state].sort(),["ACCEPTED","REJECTED"]);
  const cursor=await a.query("SELECT last_accepted_sequence::text AS seq FROM education_sync_device_cursors WHERE tenant_id=$1 AND organization_id=$2 AND device_id=$3",[tenant,org,device]);
  assert.equal(cursor.rows[0]?.seq,"3");
 } finally {
  await a.query("DELETE FROM education_sync_outbox WHERE organization_id=$1",[org]);
  await a.query("DELETE FROM education_sync_inbox WHERE organization_id=$1",[org]);
  await a.query("DELETE FROM education_sync_device_cursors WHERE organization_id=$1",[org]);
  await Promise.all([a.end(),b.end()]);
 }
});

test("P038 organization and tenant isolation is database-scoped",{skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"},async()=>{
 const c=new pg.Client({connectionString:databaseUrl}); await c.connect();
 const tenantA=randomUUID(),tenantB=randomUUID(),orgA=randomUUID(),orgB=randomUUID(),device="same-device";
 try{
  await applyMigrations(c,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const sa=new PostgresEducationSyncStore(c);
  const ea=event(tenantA,orgA,device,1n,{tenant:tenantA},"iso-"+randomUUID());
  const eb=event(tenantB,orgB,device,1n,{tenant:tenantB},"iso-"+randomUUID());
  assert.equal((await sa.accept(ea)).state,"ACCEPTED"); assert.equal((await sa.accept(eb)).state,"ACCEPTED");
  const rows=await c.query("SELECT count(*)::int AS count FROM education_sync_inbox WHERE event_id IN ($1,$2)",[ea.eventId,eb.eventId]);
  assert.equal(rows.rows[0]?.count,2);
 } finally {
  await c.query("DELETE FROM education_sync_outbox WHERE organization_id IN ($1,$2)",[orgA,orgB]);
  await c.query("DELETE FROM education_sync_inbox WHERE organization_id IN ($1,$2)",[orgA,orgB]);
  await c.query("DELETE FROM education_sync_device_cursors WHERE organization_id IN ($1,$2)",[orgA,orgB]);
  await c.end();
 }
});
