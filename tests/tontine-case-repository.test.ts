import test from "node:test";
import assert from "node:assert/strict";
import {
  PostgresTontineCaseRepository,
  type TontineCaseRepository
} from "../packages/microfinance/src/tontine-case-repository.js";
import type { TontineSqlExecutor } from "../packages/microfinance/src/tontine-repositories.js";
import type { UUID } from "../packages/domain/src/types.js";

const org="11111111-1111-4111-8111-111111111111" as UUID;
const caseId="22222222-2222-4222-8222-222222222222" as UUID;
const baseCase={
  id:caseId,organizationId:org,groupId:"33333333-3333-4333-8333-333333333333" as UUID,
  type:"dispute" as const,state:"opened" as const,openedBy:"44444444-4444-4444-8444-444444444444" as UUID,
  severity:"high" as const,summary:"Provider payout reference does not match",createdAt:"2026-11-08T09:00:00.000Z"
};

function harness() {
  const calls:Array<{sql:string;values:readonly unknown[]}>=[];
  let nextRows:Record<string,unknown>[]=[];
  let nextCount=1;
  const db:TontineSqlExecutor={
    async query<Row=Record<string,unknown>>(sql:string,values:readonly unknown[]=[]){
      calls.push({sql,values});
      return {rows:nextRows as Row[],rowCount:nextCount};
    },
    async transaction<T>(work:(tx:TontineSqlExecutor)=>Promise<T>){return work(this);}
  };
  return {
    repo:new PostgresTontineCaseRepository(db),
    calls,
    set(rows:Record<string,unknown>[],count=rows.length){nextRows=rows;nextCount=count;}
  };
}

const caseRow={
  id:caseId,organization_id:org,group_id:baseCase.groupId,type:"dispute",state:"triaged",
  opened_by:baseCase.openedBy,payout_id:null,contribution_id:null,severity:"high",
  summary:baseCase.summary,created_at:baseCase.createdAt
};

test("case transitions are tenant-scoped and compare-and-set on expected state",async()=>{
  const h=harness();
  h.set([caseRow]);
  const result=await h.repo.transitionCase(org,caseId,"opened","triaged");
  assert.equal(result.state,"triaged");
  assert.match(h.calls[0]!.sql,/organization_id=\$1 AND id=\$2 AND state=\$3/);
  assert.deepEqual(h.calls[0]!.values,[org,caseId,"opened","triaged"]);
});

test("case transition refuses a stale state and never overwrites a concurrent update",async()=>{
  const h=harness();
  h.set([]);
  await assert.rejects(()=>h.repo.transitionCase(org,caseId,"opened","triaged"),/STATE_CONFLICT_OR_NOT_FOUND/);
});

test("case state machine rejects a direct opened-to-closed transition before SQL",async()=>{
  const h=harness();
  await assert.rejects(()=>h.repo.transitionCase(org,caseId,"opened","closed"),/INVALID_TRANSITION/);
  assert.equal(h.calls.length,0);
});

test("evidence is inserted only through a case in the same tenant and stores a content hash",async()=>{
  const h=harness();
  const evidence={
    id:"55555555-5555-4555-8555-555555555555" as UUID,caseId,
    type:"provider_callback" as const,contentHash:"a".repeat(64),
    capturedBy:baseCase.openedBy,capturedAt:"2026-11-08T09:10:00.000Z"
  };
  h.set([]);
  await assert.rejects(()=>h.repo.addEvidence(org,evidence),/TENANT_MISMATCH/);
  assert.match(h.calls[0]!.sql,/FROM tontine_cases c WHERE c.organization_id=\$2 AND c.id=\$3/);
  assert.equal(h.calls[0]!.values[4],evidence.contentHash);
});

test("evidence rejects unhashed raw material",async()=>{
  const h=harness();
  await assert.rejects(()=>h.repo.addEvidence(org,{
    id:"55555555-5555-4555-8555-555555555555" as UUID,caseId,
    type:"document",contentHash:"raw-document",capturedBy:baseCase.openedBy,
    capturedAt:"2026-11-08T09:10:00.000Z"
  }),/HASH_INVALID/);
  assert.equal(h.calls.length,0);
});

test("refund workflow cannot skip Financial Core submission or settle directly from approval",async()=>{
  const h=harness();
  await assert.rejects(
    ()=>h.repo.transitionRefund(org,caseId,"approved","settled"),
    /INVALID_TRANSITION/
  );
  assert.equal(h.calls.length,0);
});

test("targeted hold release is tenant-scoped and only releases an active hold",async()=>{
  const h=harness();
  h.set([],0);
  await assert.rejects(
    ()=>h.repo.releaseHold(org,caseId,"2026-11-08T09:30:00.000Z"),
    /HOLD_NOT_ACTIVE_OR_NOT_FOUND/
  );
  assert.match(h.calls[0]!.sql,/organization_id=\$1 AND id=\$2 AND released_at IS NULL/);
});

test("repository contract is exported and concrete",()=>{
  const h=harness();
  const repository:TontineCaseRepository=h.repo;
  assert.equal(typeof repository.createCase,"function");
  assert.equal(typeof repository.createRefund,"function");
});
