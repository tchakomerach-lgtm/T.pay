import test from "node:test";
import assert from "node:assert/strict";
import { recordTontineProviderIncident } from "../packages/microfinance/src/tontine-provider-incident.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";
import type { UUID } from "../packages/domain/src/types.js";

const org="11111111-1111-4111-8111-111111111111" as UUID;
const group="22222222-2222-4222-8222-222222222222" as UUID;
const caseId="33333333-3333-4333-8333-333333333333" as UUID;
const input={
  organizationId:org,cycleId:"44444444-4444-4444-8444-444444444444",
  provider:"tmoney",providerEventId:"evt-incident-1",rawBody:"signed-provider-payload",
  occurredAt:"2026-11-08T12:00:00.000Z",reason:"PAYOUT_NOT_APPROVED" as const
};

function harness(inserted=true) {
  const calls:Array<{sql:string;values:readonly unknown[]}>=[];
  const db:TontineSqlExecutor={
    async query<Row=Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){
      calls.push({sql,values});
      if(sql.includes("SELECT group_id FROM tontine_cycles"))return {rows:[{group_id:group} as Row],rowCount:1};
      if(sql.includes("INSERT INTO tontine_cases"))return {rows:(inserted?[{id:caseId}]:[]) as Row[],rowCount:inserted?1:0};
      if(sql.includes("SELECT id FROM tontine_cases"))return {rows:[{id:caseId} as Row],rowCount:1};
      return {rows:[] as Row[],rowCount:1};
    },
    async transaction<T>(work:(tx:TontineSqlExecutor)=>Promise<T>){return work(this);}
  };
  return {db,calls};
}

test("provider incident atomically persists case, hashed evidence and outbox",async()=>{
  const h=harness();
  const result=await recordTontineProviderIncident(h.db,input);
  assert.deepEqual(result,{caseId,created:true});
  assert.equal(h.calls.length,4);
  assert.match(h.calls[1]!.sql,/opened_by_system,source_event_key/);
  assert.match(h.calls[1]!.sql,/ON CONFLICT \(organization_id,source_event_key\)/);
  assert.match(h.calls[2]!.sql,/provider_callback/);
  assert.match(h.calls[2]!.sql,/captured_by_system/);
  assert.match(h.calls[2]!.sql,/NULL,true/);
  assert.match(h.calls[3]!.sql,/tontine\.provider_incident\.opened/);
  assert.equal(h.calls[2]!.values[3] instanceof String,false);
  assert.equal(String(h.calls[2]!.values[3]).length,64);
  assert.equal(h.calls[2]!.values[4],"provider-event:tmoney:evt-incident-1");
});

test("duplicate provider event returns existing case and emits no second outbox event",async()=>{
  const h=harness(false);
  const result=await recordTontineProviderIncident(h.db,input);
  assert.deepEqual(result,{caseId,created:false});
  assert.equal(h.calls.length,3);
  assert.ok(!h.calls.some(call=>call.sql.includes("INSERT INTO outbox_events")));
});

test("missing cycle fails closed without fabricating a group or actor",async()=>{
  const h=harness();
  h.db.query=async<Row=Record<string,unknown>>(sql:string,values:readonly unknown[]=[] )=>{
    h.calls.push({sql,values});
    return {rows:[] as Row[],rowCount:0};
  };
  const result=await recordTontineProviderIncident(h.db,input);
  assert.deepEqual(result,{caseId:null,created:false});
  assert.equal(h.calls.length,1);
});
