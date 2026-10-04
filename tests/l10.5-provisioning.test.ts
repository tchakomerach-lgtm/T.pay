import test from "node:test";
import assert from "node:assert/strict";
import {PostgresOrganizationProvisioningService} from "../packages/organization/src/provisioning-service.js";

test("L10.5 provisioning creates organization, director role, owner membership and surfaces",async()=>{
  const sql:string[]=[];
  const db={query:async(q:string)=>{sql.push(q);return {rowCount:1,rows:[]}}};
  const service=new PostgresOrganizationProvisioningService(db as any);
  const r=await service.provision({id:"o1",slug:"ecole-demo",name:"Ecole Demo",organizationType:"school",ownerUserId:"u1",accessCode:"Tpay@2026",idempotencyKey:"org-provision-2026-0001",requestHash:"hash1",createdAt:"2026-10-04T14:00:00Z"});
  assert.equal(r.replayed,false);
  assert.equal(sql.length,8);
});

test("L10.5 provisioning rejects idempotency conflicts",async()=>{
  const db={query:async()=>({rowCount:1,rows:[{organization_id:"o1",request_hash:"different"}]})};
  const service=new PostgresOrganizationProvisioningService(db as any);
  await assert.rejects(()=>service.provision({id:"o1",slug:"x",name:"x",organizationType:"school",ownerUserId:"u1",accessCode:"Tpay@2026",idempotencyKey:"org-provision-2026-0001",requestHash:"hash1",createdAt:"2026-10-04T14:00:00Z"}),/ORG_IDEMPOTENCY_CONFLICT/);
});
