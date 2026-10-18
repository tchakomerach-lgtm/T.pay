import assert from "node:assert/strict";
import test from "node:test";
import { PostgresFieldRegistryRepository, type FieldRegistryDb, type OfflineFieldVisit, type FieldRegistryQueryResult } from "../packages/microfinance/src/field-registry-repository.js";

const org = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";
const agent = "33333333-3333-4333-8333-333333333333";
const device = "44444444-4444-4444-8444-444444444444";
const correlation = "55555555-5555-4555-8555-555555555555";
const event: OfflineFieldVisit = {
  organizationId: org, customerId: customer, authorizedAgentId: agent, trustedDeviceId: device,
  visitStatus: "completed", eventSequence: 1, idempotencyKey: "visit-device-0001",
  eventAt: "2026-10-18T10:00:00.000Z", latitude: 6.1319, longitude: 1.2228,
  accuracyMeters: 12, correlationId: correlation,
};
function fakeDb(handler: (sql: string, values: unknown[] | undefined) => Promise<FieldRegistryQueryResult>): FieldRegistryDb {
  return { query: handler };
}

test("route and visit reads are always organization-scoped", async () => {
  const calls: {sql:string;values:unknown[]|undefined}[] = [];
  const repository = new PostgresFieldRegistryRepository(fakeDb(async (sql, values) => {
    calls.push({sql, values}); return {rows:[], rowCount:0};
  }));
  await repository.listRoutes(org);
  await repository.listVisits({organizationId:org, routeId: "66666666-6666-4666-8666-666666666666"});
  assert.match(calls[0]!.sql, /WHERE organization_id = \$1/);
  assert.deepEqual(calls[0]!.values, [org]);
  assert.match(calls[1]!.sql, /WHERE organization_id = \$1/);
  assert.deepEqual(calls[1]!.values?.[0], org);
});

test("offline visit is idempotent and uses server-supplied agent/device identities", async () => {
  const calls: {sql:string;values:unknown[]|undefined}[] = [];
  const repository = new PostgresFieldRegistryRepository(fakeDb(async (sql, values) => {
    calls.push({sql, values});
    if (sql.startsWith("SELECT id, idempotency_key")) return {rows:[],rowCount:0};
    if (sql.includes("INSERT INTO customer_field_visit_events")) return {rows:[{id:"persisted"}],rowCount:1};
    return {rows:[],rowCount:0};
  }));
  const result = await repository.recordOfflineVisit(event);
  assert.equal(result.outcome, "accepted");
  const insert = calls.find(call => call.sql.includes("INSERT INTO customer_field_visit_events"))!;
  assert.match(insert.sql, /WHERE EXISTS/);
  assert.match(insert.sql, /customer_field_assignments/);
  assert.equal(insert.values?.[4], agent);
  assert.equal(insert.values?.[5], device);
  assert.equal(insert.values?.[1], org);
});

test("offline visit rejects invalid coordinates and malformed idempotency keys before SQL", async () => {
  let calls = 0;
  const repository = new PostgresFieldRegistryRepository(fakeDb(async () => { calls++; return {rows:[],rowCount:0}; }));
  await assert.rejects(repository.recordOfflineVisit({...event, latitude: 999}), /FIELD_VISIT_LATITUDE_INVALID/);
  await assert.rejects(repository.recordOfflineVisit({...event, idempotencyKey: "x"}), /FIELD_VISIT_IDEMPOTENCY_KEY_INVALID/);
  assert.equal(calls, 0);
});

test("same idempotency key with different evidence is rejected as a replay conflict", async () => {
  const repository = new PostgresFieldRegistryRepository(fakeDb(async (sql) => {
    if (sql.startsWith("SELECT id, idempotency_key")) return {rows:[{id:"existing",idempotency_key:event.idempotencyKey,evidence_hash:"different"}],rowCount:1};
    return {rows:[],rowCount:0};
  }));
  await assert.rejects(repository.recordOfflineVisit(event), /FIELD_VISIT_IDEMPOTENCY_CONFLICT/);
});

test("same offline visit replay remains idempotent when request correlation ID changes", async () => {
  let storedHash: string | undefined;
  let storedKey: string | undefined;
  const repository = new PostgresFieldRegistryRepository(fakeDb(async (sql, values) => {
    if (sql.startsWith("SELECT id, idempotency_key")) {
      return storedHash ? {rows:[{id:"persisted",idempotency_key:storedKey,evidence_hash:storedHash}],rowCount:1} : {rows:[],rowCount:0};
    }
    if (sql.includes("INSERT INTO customer_field_visit_events")) {
      storedHash = String(values?.[13]);
      storedKey = String(values?.[8]);
      return {rows:[{id:"persisted",evidence_hash:storedHash}],rowCount:1};
    }
    return {rows:[],rowCount:0};
  }));
  const first = await repository.recordOfflineVisit(event);
  const retry = await repository.recordOfflineVisit({...event, correlationId:"77777777-7777-4777-8777-777777777777"});
  assert.equal(first.outcome,"accepted");
  assert.equal(retry.outcome,"replayed");
});
