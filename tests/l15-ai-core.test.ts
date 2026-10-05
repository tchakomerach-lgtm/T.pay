import test from "node:test";
import assert from "node:assert/strict";
import { AiCore } from "../packages/ai/src/ai-core.js";
import { AiProviderRegistry } from "../packages/ai/src/provider.js";
import { AiToolRegistry } from "../packages/ai/src/tool-registry.js";

function provider(id:string,priority:number,fail=false){
  return {id,priority,enabled:true,async generate(request:{model:string}){if(fail)throw new Error("PROVIDER_DOWN");return {provider:id,model:request.model,requestId:id+"-1",outputText:"ok"};}};
}

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
  assert.equal(await tools.execute("send-message",{}, {...ctx,approved:true}),"sent");
});

test("AI Core rejects an empty objective",async()=>{
  const core=new AiCore(new AiProviderRegistry(),new AiToolRegistry(),[],{maxAgentHops:4,allowedProviders:[],defaultMaxOutputTokens:100});
  await assert.rejects(()=>core.run(" ",{organizationId:"org",actorId:"actor",requestId:"r"}),/AI_OBJECTIVE_REQUIRED/);
});
