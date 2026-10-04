import test from "node:test"; import assert from "node:assert/strict";
import {PostgresSessionRepository} from "../packages/organization/src/postgres-session-repository.js";
import {PostgresAiApprovalRepository} from "../packages/ai-core/src/postgres-approval-repository.js";

test("L10.2 session repository scopes revoke to tenant and user",async()=>{let call:any;const db={query:async(sql:string,args?:unknown[])=>{call={sql,args};return {rowCount:1,rows:[]}}};const repo=new PostgresSessionRepository(db as any);assert.equal(await repo.revoke("s","o","u","2026-10-04T00:00:00Z"),true);assert.match(call.sql,/organization_id=\$2 AND user_id=\$3/);});
test("L10.2 AI approval is single-transition",async()=>{let call:any;const db={query:async(sql:string,args?:unknown[])=>{call={sql,args};return {rowCount:1,rows:[{id:"a"}]}}};const repo=new PostgresAiApprovalRepository(db as any);assert.equal(await repo.decide({id:"a",organizationId:"o",reviewerUserId:"r",status:"approved",decidedAt:"2026-10-04T00:00:00Z"}),true);assert.match(call.sql,/status='pending'/);});
