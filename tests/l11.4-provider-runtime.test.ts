import test from "node:test";
import assert from "node:assert/strict";
import {ProviderCircuitBreaker,executeProvider} from "../packages/ai-core/src/provider-runtime.js";
import type {AiProviderAdapter} from "../packages/ai-core/src/provider-adapter.js";

const route={provider:"openai" as const,model:"gpt",purpose:"reasoning" as const,maxInputTokens:1000};
const request={requestId:"r1",systemPrompt:"s",userPrompt:"u",maxOutputTokens:100};

test("L11.4 retries transient provider failures and succeeds",async()=>{
  let calls=0;
  const adapter:AiProviderAdapter={provider:"openai",generate:async()=>{calls++;if(calls<3)throw new Error("AI_PROVIDER_UNAVAILABLE");return {provider:"openai",model:"gpt",text:"ok",inputTokens:1,outputTokens:1,finishReason:"stop"}}};
  const breaker=new ProviderCircuitBreaker({failureThreshold:5,cooldownMs:1000});
  const result=await executeProvider(adapter,request,route,{retry:{maxAttempts:3,timeoutMs:100,baseDelayMs:0},circuit:{failureThreshold:5,cooldownMs:1000},allowExternal:true,dataClass:"public"},breaker);
  assert.equal(result.text,"ok"); assert.equal(calls,3);
});

test("L11.4 opens a circuit after repeated failures",()=>{
  const breaker=new ProviderCircuitBreaker({failureThreshold:2,cooldownMs:60000});
  breaker.failure(1000); breaker.failure(1000);
  assert.throws(()=>breaker.assertAvailable(1001),/AI_PROVIDER_CIRCUIT_OPEN/);
});

test("L11.4 timeout is treated as transient",async()=>{
  const adapter:AiProviderAdapter={provider:"openai",generate:async()=>new Promise(()=>{})};
  const breaker=new ProviderCircuitBreaker({failureThreshold:5,cooldownMs:1000});
  await assert.rejects(()=>executeProvider(adapter,request,route,{retry:{maxAttempts:1,timeoutMs:10,baseDelayMs:0},circuit:{failureThreshold:5,cooldownMs:1000},allowExternal:true,dataClass:"public"},breaker),/AI_PROVIDER_TIMEOUT/);
});
