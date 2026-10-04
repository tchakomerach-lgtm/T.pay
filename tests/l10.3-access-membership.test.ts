import test from "node:test";
import assert from "node:assert/strict";
import {hashOrganizationAccessCode,verifyOrganizationAccessCode} from "../packages/organization/src/access-code.js";
import {PostgresOrganizationMembershipRepository} from "../packages/organization/src/postgres-membership-repository.js";

test("L10.3 access code is salted and verifies without storing plaintext",()=>{
  const hash=hashOrganizationAccessCode("Tpay@2026");
  assert.match(hash,/^scrypt\$/);
  assert.notEqual(hash,"Tpay@2026");
  assert.equal(verifyOrganizationAccessCode("Tpay@2026",hash),true);
  assert.equal(verifyOrganizationAccessCode("wrong",hash),false);
  assert.notEqual(hash,hashOrganizationAccessCode("Tpay@2026"));
});

test("L10.3 membership repository scopes member and role reads by organization",async()=>{
  const calls:any[]=[];
  const db={query:async(sql:string,args?:unknown[])=>{calls.push({sql,args});return {rowCount:1,rows:[{organization_id:"o1",user_id:"u1",role_id:"r1",status:"active"}]}}};
  const repo=new PostgresOrganizationMembershipRepository(db as any);
  const member=await repo.findMember("o1","u1");
  assert.equal(member?.organizationId,"o1");
  assert.deepEqual(calls[0].args,["o1","u1"]);
});
