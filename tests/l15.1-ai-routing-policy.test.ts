import test from "node:test";
import assert from "node:assert/strict";
import { AiProviderRegistry } from "../packages/ai/src/provider.js";
import { selectProviders } from "../packages/ai/src/routing-policy.js";

const p=(id:string,priority:number)=>({id,priority,enabled:true,generate:async()=>({provider:id,model:"m",requestId:"r",outputText:"ok"})});

test("routing only uses policy-allowed providers",()=>{
  const r=new AiProviderRegistry();r.register(p("openai",1));r.register(p("anthropic",2));r.register(p("other",3));
  const out=selectProviders(r,{allowedProviders:["anthropic","openai"],allowedDataClasses:["public","internal"],maxOutputTokens:100,maxAttempts:2,maxLatencyMs:1000},{organizationId:"o",dataClass:"internal"});
  assert.deepEqual(out.map(x=>x.provider.id),["openai","anthropic"]);
});

test("sensitive class is denied unless explicitly allowed",()=>{
  const r=new AiProviderRegistry();r.register(p("openai",1));
  assert.throws(()=>selectProviders(r,{allowedProviders:["openai"],allowedDataClasses:["public"],maxOutputTokens:100,maxAttempts:1,maxLatencyMs:1000},{organizationId:"o",dataClass:"sensitive_financial"}),/AI_DATA_CLASS_NOT_ALLOWED/);
});

test("required provider cannot silently fail over",()=>{
  const r=new AiProviderRegistry();r.register(p("openai",1));r.register(p("anthropic",2));
  const out=selectProviders(r,{allowedProviders:["openai","anthropic"],allowedDataClasses:["public"],requiredProvider:"anthropic",maxOutputTokens:100,maxAttempts:3,maxLatencyMs:1000},{organizationId:"o",dataClass:"public"});
  assert.deepEqual(out.map(x=>x.provider.id),["anthropic"]);
});
