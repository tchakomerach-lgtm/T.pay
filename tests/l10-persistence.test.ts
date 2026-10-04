import test from "node:test";
import assert from "node:assert/strict";
import { PostgresOrganizationRepository } from "../packages/organization/src/postgres-repository.js";
import { PostgresAiRunRepository } from "../packages/ai-core/src/postgres-run-repository.js";

test("L10.1 organization adapter maps persisted organization", async () => {
  const calls:any[]=[];
  const db={query:async(sql:string,args?:unknown[])=>{calls.push({sql,args});return {rows:sql.startsWith("SELECT")?[{id:"o1",name:"Ecole Togo",organization_type:"school",owner_user_id:"u1",access_code_hash:"hash",created_at:"2026-10-04T00:00:00Z",status:"active"}]:[]}}};
  const repo=new PostgresOrganizationRepository(db as any);
  await repo.insert({id:"o1" as any,name:"Ecole Togo",type:"school",founderId:"u1" as any,accessCodeHash:"hash",createdAt:"2026-10-04T00:00:00Z",status:"active"});
  const org=await repo.findById("o1" as any);
  assert.equal(org?.type,"school");
  assert.match(calls[0].sql,/INSERT INTO organizations/);
});

test("L10.1 AI run adapter keeps organization scope", async () => {
  let call:any;
  const db={query:async(sql:string,args?:unknown[])=>{call={sql,args};return {rows:[]}}};
  const repo=new PostgresAiRunRepository(db as any);
  await repo.appendRun({id:"run1",organizationId:"org1",userId:"user1",modelProvider:"local",modelName:"safe-router",policyVersion:"AI-POLICY-001",action:"human_review",risk:"high",inputHash:"a".repeat(64),createdAt:"2026-10-04T00:00:00Z"});
  assert.match(call.sql,/INSERT INTO ai_runs/);
  assert.equal(call.args[1],"org1");
});
