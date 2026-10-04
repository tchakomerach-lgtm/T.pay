import test from "node:test";
import assert from "node:assert/strict";
import {authorizeSandboxTool} from "../packages/ai-core/src/tool-sandbox.js";
import {PostgresAiToolPolicyRepository} from "../packages/ai-core/src/postgres-tool-policy-repository.js";

const tool={name:"documents.search",description:"search documents",risk:"low" as const,requiresHumanApproval:false,allowedAgentRoles:["support"] as const};

test("L11.2 sandbox requires tenant, role, enabled policy and bounded risk",()=>{
  const policy={organizationId:"o1",toolName:"documents.search",enabled:true,allowedAgentRoles:["support"] as any,maxRisk:"low" as const,requiresHumanApproval:false,version:1};
  assert.doesNotThrow(()=>authorizeSandboxTool("o1","support",tool,policy));
  assert.throws(()=>authorizeSandboxTool("o2","support",tool,policy),/TENANT_MISMATCH/);
  assert.throws(()=>authorizeSandboxTool("o1","finance",tool,policy),/ROLE_FORBIDDEN/);
  assert.throws(()=>authorizeSandboxTool("o1","support",tool,{...policy,enabled:false}),/DISABLED/);
  assert.throws(()=>authorizeSandboxTool("o1","support",{...tool,risk:"high"},policy),/RISK_EXCEEDS_POLICY/);
});

test("L11.2 policy repository keeps organization scope",async()=>{
  let call:any;
  const db={query:async(sql:string,args?:unknown[])=>{call={sql,args};return {rows:[]}}};
  const repo=new PostgresAiToolPolicyRepository(db as any);
  await repo.upsert({organizationId:"o1",toolName:"documents.search",enabled:true,allowedAgentRoles:["support"],maxRisk:"low",requiresHumanApproval:false,version:1});
  assert.equal(call.args[0],"o1");
  assert.match(call.sql,/ON CONFLICT \(organization_id,tool_name\)/);
});
