import assert from "node:assert/strict";
import test from "node:test";
import { PostgresSchoolMutationUnitOfWork, claimSchoolOutbox, markSchoolOutboxPublished, retrySchoolOutbox } from "../packages/education/src/postgres-school-mutation-uow.js";

function fakeClient(failAt?:string){
 const calls:Array<{sql:string;values:unknown[]}>=[];
 return {calls,async query(sql:string,values:unknown[]=[]){
   calls.push({sql,values});
   if(failAt && sql.includes(failAt))throw new Error("INJECTED_FAILURE");
   if(sql.includes("UPDATE education_transactional_outbox SET state='PUBLISHED'"))return {rows:[],rowCount:0};
   if(sql.includes("UPDATE education_transactional_outbox"))return {rows:[],rowCount:1};
   if(sql.includes("WITH candidates"))return {rows:[],rowCount:0};
   return {rows:[],rowCount:1};
 }};
}
const scope={tenantId:"tenant-1",organizationId:"org-1",actorId:"actor-1",requestId:"request-1",route:"/v1/education/classes",correlationId:"corr-1"};

test("P056 UoW writes tenant context, mutation, audit and outbox before one commit",async()=>{
 const db=fakeClient();
 const uow=new PostgresSchoolMutationUnitOfWork(db as any);
 const result=await uow.execute(scope,async tx=>{
   await tx.query("INSERT INTO education_classes(class_id) VALUES($1)",["class-1"]);
   return {data:{classId:"class-1"},event:{type:"class.changed" as const,occurredAt:new Date(0).toISOString(),entityId:"class-1",version:1,data:{operation:"create"}}};
 });
 assert.equal(result.data.classId,"class-1");
 const sql=db.calls.map(x=>x.sql);
 assert.equal(sql[0],"BEGIN");
 assert.ok(sql.some(x=>x.includes("set_config('tpay.tenant_id'")));
 assert.ok(sql.some(x=>x.includes("INSERT INTO education_classes")));
 assert.ok(sql.some(x=>x.includes("INSERT INTO api_request_audit")));
 assert.ok(sql.some(x=>x.includes("INSERT INTO education_transactional_outbox")));
 assert.equal(sql.at(-1),"COMMIT");
});

test("P056 UoW rolls back mutation, audit and outbox together on failure",async()=>{
 const db=fakeClient("INSERT INTO education_transactional_outbox");
 const uow=new PostgresSchoolMutationUnitOfWork(db as any);
 await assert.rejects(()=>uow.execute(scope,async tx=>{
   await tx.query("UPDATE education_classes SET name='X'");
   return {data:true,event:{type:"class.changed" as const,occurredAt:new Date(0).toISOString(),entityId:"class-1",version:1,data:{}}};
 }),/INJECTED_FAILURE/);
 assert.equal(db.calls.at(-1)?.sql,"ROLLBACK");
 assert.ok(!db.calls.some(x=>x.sql==="COMMIT"));
});

test("P056 outbox claims use SKIP LOCKED and require worker lease ownership",async()=>{
 const db=fakeClient();
 await claimSchoolOutbox(db as any,"worker-1",25,30);
 assert.match(db.calls[0]!.sql,/FOR UPDATE SKIP LOCKED/);
 await markSchoolOutboxPublished(db as any,"outbox-1","worker-1");
 await retrySchoolOutbox(db as any,"outbox-2","worker-1","NETWORK_UNAVAILABLE");
 assert.ok(db.calls.some(x=>x.sql.includes("locked_by=$2")));
});
