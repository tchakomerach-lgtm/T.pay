import test from "node:test";
import assert from "node:assert/strict";
import { reconcileTontineProviderReceipt, listOpenTontineReconciliationFindings } from "../packages/microfinance/src/tontine-reconciliation.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";
import type { UUID } from "../packages/domain/src/types.js";
const org="11111111-1111-4111-8111-111111111111" as UUID;
const id="22222222-2222-4222-8222-222222222222" as UUID;
const source={organization_id:org,provider:"tmoney",provider_event_id:"evt-1",payout_id:"33333333-3333-4333-8333-333333333333" as UUID,callback_state:"processed",observed_amount_minor:"5000",observed_currency:"XOF",payout_state:"confirmed",expected_amount_minor:"5000",expected_currency:"XOF"};
function harness(row:Record<string,unknown>,existing?:Record<string,unknown>) {
 const calls:Array<{sql:string;values:readonly unknown[]}>=[];
 const db:TontineSqlExecutor={
  async query<Row=Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){
   calls.push({sql,values});
   if(sql.includes("FROM tontine_provider_callback_receipts r"))return {rows:[row as Row],rowCount:1};
   if(sql.includes("FROM tontine_reconciliation_findings")&&sql.includes("FOR UPDATE"))return {rows:existing?[existing as Row]:[],rowCount:existing?1:0};
   if(sql.includes("INSERT INTO tontine_reconciliation_findings"))return {rows:[{id,organization_id:org,provider:"tmoney",provider_event_id:"evt-1",payout_id:row.payout_id,classification:values[5],severity:values[6],callback_state:values[7],payout_state:values[8],expected_amount_minor:values[9],observed_amount_minor:values[10],expected_currency:values[11],observed_currency:values[12],check_count:1,first_seen_at:"2026-11-08T12:00:00Z",last_checked_at:"2026-11-08T12:00:00Z",resolved_at:values[5]==="matched"?"2026-11-08T12:00:00Z":null} as Row],rowCount:1};
   return {rows:[],rowCount:1};
  },
  async transaction<T>(work:(tx:TontineSqlExecutor)=>Promise<T>){return work(this);}
 };
 return {db,calls};
}
test("confirmed callback with exact amount/currency is matched",async()=>{
 const h=harness(source); const result=await reconcileTontineProviderReceipt(h.db,org,"tmoney","evt-1","2026-11-08T12:00:00Z");
 assert.equal(result.classification,"matched"); assert.equal(result.resolvedAt,"2026-11-08T12:00:00.000Z");
 assert.equal(h.calls.some(c=>c.sql.includes("tontine.reconciliation.finding_changed")),false);
});
test("amount mismatch is critical and emits one transactional outbox event",async()=>{
 const h=harness({...source,observed_amount_minor:"4999"});
 const result=await reconcileTontineProviderReceipt(h.db,org,"tmoney","evt-1","2026-11-08T12:00:00Z");
 assert.equal(result.classification,"amount_mismatch"); assert.equal(result.severity,"critical");
 assert.equal(h.calls.filter(c=>c.sql.includes("INSERT INTO outbox_events")).length,1);
});
test("missing receipt fails closed",async()=>{
 const h=harness({}); h.db.query=async<Row=Record<string,unknown>>(sql:string,values:readonly unknown[]=[] )=>{h.calls.push({sql,values});return {rows:[] as Row[],rowCount:0};};
 await assert.rejects(()=>reconcileTontineProviderReceipt(h.db,org,"tmoney","missing","2026-11-08T12:00:00Z"),/TONTINE_CALLBACK_RECEIPT_NOT_FOUND/);
});
test("queue is tenant-filtered and enforces a bounded page size",async()=>{
 const h=harness(source);
 await assert.rejects(()=>listOpenTontineReconciliationFindings(h.db,org,201),/TONTINE_RECONCILIATION_LIMIT_INVALID/);
 await listOpenTontineReconciliationFindings(h.db,org,25);
 assert.ok(h.calls.at(-1)?.sql.includes("organization_id=$1"));
});
