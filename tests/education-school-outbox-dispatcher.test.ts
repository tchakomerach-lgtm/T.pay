import assert from "node:assert/strict";
import test from "node:test";
import { PostgresSchoolOutboxDispatcher } from "../packages/education/src/postgres-school-outbox-dispatcher.js";

const claimedRow={
 outbox_id:"outbox-1",tenant_id:"tenant-1",organization_id:"org-1",event_id:"event-1",
 event_type:"class.changed",entity_id:"class-1",entity_version:"2",
 occurred_at:"2026-11-02T06:00:00.000Z",
 payload:{type:"class.changed",entityId:"class-1",version:2,data:{operation:"POST"}},attempts:1
};

function client(failMark=false){
 const calls:string[]=[];
 return {calls,async query(sql:string){
  calls.push(sql);
  if(sql.includes("WITH candidates"))return {rows:[claimedRow],rowCount:1};
  if(sql.includes("UPDATE education_transactional_outbox SET state='PUBLISHED'"))return {rows:[],rowCount:failMark?0:1};
  if(sql.includes("UPDATE education_transactional_outbox"))return {rows:[{state:"PENDING"}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
}

test("P056.1 dispatcher claims the transactional Outbox, appends once and publishes after commit",async()=>{
 const db=client();const appended:any[]=[];const published:any[]=[];
 const dispatcher=new PostgresSchoolOutboxDispatcher(
  ()=>db as any,
  {publish:(event:any)=>published.push(event)} as any,
  {append:async(event:any)=>{appended.push(event);return 9n;}} as any
 );
 const result=await dispatcher.dispatchScope("tenant-1","org-1","worker-1");
 assert.deepEqual(result,{claimed:1,published:1,retried:0,dead:0});
 assert.equal(appended.length,1);assert.equal(published.length,1);
 assert.equal(published[0].id,"event-1");assert.equal(published[0].streamSequence,"9");
 assert.ok(db.calls.includes("COMMIT"));
 assert.ok(db.calls.some(sql=>sql.includes("education_transactional_outbox SET state='PUBLISHED'")));
});

test("P056.1 dispatcher retries delivery failures without changing committed domain state",async()=>{
 const db=client();let published=0;
 const dispatcher=new PostgresSchoolOutboxDispatcher(
  ()=>db as any,
  {publish:()=>{published++;throw new Error("subscriber unavailable");}} as any,
  {append:async()=>9n} as any
 );
 const result=await dispatcher.dispatchScope("tenant-1","org-1","worker-1");
 assert.deepEqual(result,{claimed:1,published:0,retried:1,dead:0});
 assert.equal(published,1);
 assert.ok(db.calls.some(sql=>sql.includes("UPDATE education_transactional_outbox")));
});
