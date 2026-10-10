import test from "node:test";
import assert from "node:assert/strict";
import { CommunityTontineMfApprovalService } from "../packages/microfinance/src/community-tontine-mf-approval.js";
import { PostgresCommunityTontineMfPortfolioRepository } from "../packages/microfinance/src/community-tontine-mf-portfolio-repository.js";

const id="11111111-1111-4111-8111-111111111111" as any;
const access={id,organizationId:id,tontineGroupId:id,microfinanceId:id,role:"settlement_supervisor" as const,status:"active" as const,grantedBy:id,createdAt:"2026-10-06T00:00:00Z"};

test("payout approval rejects the same actor who prepared it", async()=>{
  const service=new CommunityTontineMfApprovalService({markApproved:async()=>{throw new Error("should-not-run");}});
  const instruction={id,tontineGroupId:id,microfinanceId:id,payoutId:id,beneficiaryClientId:id,amountMinor:1000n,currency:"XOF",destinationRef:"mf:c1",requiresHumanApproval:true,preparedBy:id,state:"prepared" as const,createdAt:"2026-10-06T00:00:00Z"};
  await assert.rejects(()=>service.approve(access,id,instruction,id,"2026-10-06T01:00:00Z"),/MAKER_CHECKER/);
});

test("portfolio repository cannot return another organization's portfolio", async()=>{
  const calls:any[]=[];
  const db={query:async(sql:string,values:any[])=>{calls.push({sql,values});return {rows:[]};}} as any;
  const repo=new PostgresCommunityTontineMfPortfolioRepository(db);
  assert.equal(await repo.get(id,id,id),null);
  assert.equal(calls[0].values.length,3);
  assert.match(calls[0].sql,/g\.organization_id = \$1 AND g\.id = \$2/);
});
