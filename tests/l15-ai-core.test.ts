import test from "node:test";
import assert from "node:assert/strict";
import { AiCore } from "../packages/ai/src/ai-core.js";
import { AiProviderRegistry } from "../packages/ai/src/provider.js";
import { AiToolRegistry } from "../packages/ai/src/tool-registry.js";
import { type AiRequestClassification, type AiRoutePolicy } from "../packages/ai/src/routing-policy.js";

function provider(id:string,priority:number,fail=false){return {id,priority,enabled:true,async generate(request:{model:string}){if(fail)throw new Error("PROVIDER_DOWN");return {provider:id,model:request.model,requestId:id+"-1",outputText:"ok"};}};}

test("AI Core fails over to the next allowed provider",async()=>{
  const providers=new AiProviderRegistry(); providers.register(provider("openai",1,true)); providers.register(provider("anthropic",2,false));
  const core=new AiCore(providers,new AiToolRegistry(),[],{maxAgentHops:4,allowedProviders:["openai","anthropic"],defaultMaxOutputTokens:100});
  const result=await core.generate({model:"test",messages:[{role:"user",content:"x"}],maxOutputTokens:20});
  assert.equal(result.provider,"anthropic");
});

test("AI tools are deny-by-default and approval-gated",async()=>{
  const tools=new AiToolRegistry();
  tools.register({name:"send-message",version:"1",risk:"high",requiresApproval:true,allowedAgents:["commercial-growth"],execute:async()=> "sent"});
  const ctx={organizationId:"org",actorId:"actor",agentId:"commercial-growth",approved:false};
  await assert.rejects(()=>tools.execute("send-message",{},ctx),/AI_TOOL_APPROVAL_REQUIRED/);
  await assert.rejects(()=>tools.execute("send-message",{}, {...ctx,approved:true}),/AI_TOOL_APPROVAL_BINDING_REQUIRED/);
  const payloadHash=canonicalPayloadHash({});
  assert.equal(await tools.execute("send-message",{}, {...ctx,approved:true,approvalPayloadHash:payloadHash}),"sent");
  await assert.rejects(()=>tools.execute("send-message",{}, {...ctx,approved:true,approvalPayloadHash:"bad"}),/AI_TOOL_APPROVAL_PAYLOAD_MISMATCH/);
});

test("critical AI tools cannot be registered without approval",()=>{
  const tools=new AiToolRegistry();
  assert.throws(()=>tools.register({name:"root-action",version:"1",risk:"critical",requiresApproval:false,allowedAgents:["x"],execute:async()=> "bad"}),/AI_CRITICAL_TOOL_APPROVAL_REQUIRED/);
});

test("expired AI capability is rejected",async()=>{
  const tools=new AiToolRegistry();
  tools.register({name:"read-sensitive",version:"1",risk:"low",requiresApproval:false,allowedAgents:["agent"],execute:async()=> "ok"});
  await assert.rejects(()=>tools.execute("read-sensitive",{}, {organizationId:"o",actorId:"a",agentId:"agent",approved:false,capabilityExpiresAt:Date.now()-1}),/AI_TOOL_CAPABILITY_EXPIRED/);
});

test("AI Core rejects an empty objective",async()=>{
  const core=new AiCore(new AiProviderRegistry(),new AiToolRegistry(),[],{maxAgentHops:4,allowedProviders:[],defaultMaxOutputTokens:100});
  await assert.rejects(()=>core.run(" ",{organizationId:"org",actorId:"actor",requestId:"r"}),/AI_OBJECTIVE_REQUIRED/);
});

test("AI Core routed generation respects data and provider policy",async()=>{
  const providers=new AiProviderRegistry(); providers.register(provider("openai",1,true)); providers.register(provider("anthropic",2,false));
  const core=new AiCore(providers,new AiToolRegistry(),[],{maxAgentHops:4,allowedProviders:["openai","anthropic"],defaultMaxOutputTokens:100});
  const classification:AiRequestClassification={organizationId:"org",dataClass:"public"};
  const routePolicy:AiRoutePolicy={allowedProviders:["openai","anthropic"],allowedDataClasses:["public"],maxOutputTokens:100,maxAttempts:2,maxLatencyMs:1000};
  const result=await core.generateRouted({model:"test",messages:[{role:"user",content:"x"}],maxOutputTokens:20},classification,routePolicy);
  assert.equal(result.provider,"anthropic");
});
