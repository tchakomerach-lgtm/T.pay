import assert from "node:assert/strict";
import test from "node:test";
import {AiCore} from "../packages/ai/src/ai-core.js";
import {AiProviderRegistry} from "../packages/ai/src/provider.js";
import {AiToolRegistry} from "../packages/ai/src/tool-registry.js";
import type {AiRoutePolicy} from "../packages/ai/src/routing-policy.js";
import type {AiGenerateRequest} from "../packages/ai/src/provider.js";

function makeCore(outputText:string,onRequest?:(request:AiGenerateRequest)=>void){
 const providers=new AiProviderRegistry();
 providers.register({
  id:"compatible",priority:1,enabled:true,
  async generate(request){onRequest?.(request);return {provider:"compatible",model:"test-model",requestId:"req-123456",outputText};}
 });
 return new AiCore(providers,new AiToolRegistry(),[],{maxAgentHops:1,allowedProviders:["compatible"],defaultMaxOutputTokens:256});
}
const request={model:"test-model",messages:[{role:"user" as const,content:"Summarize this safely"}],maxOutputTokens:256};

test("AI Core sanitizes personal identifiers and provider tokens from normal generation output",async()=>{
 const token="ghp_"+"abcdefghijklmnopqrstuvwxyz1234567890";
 const core=makeCore("Contact person@example.com or local number 90123456; credential "+token);
 const result=await core.generate(request);
 assert.ok(!result.outputText.includes("person@example.com"));
 assert.ok(!result.outputText.includes("90123456"));
 assert.ok(!result.outputText.includes(token));
 assert.ok(result.outputText.includes("[REDACTED_EMAIL]"));
 assert.ok(result.outputText.includes("[REDACTED_API_TOKEN]"));
});

test("AI Core sanitizes routed provider output too",async()=>{
 const core=makeCore("Bearer abc.def.ghi; call +228 90123456");
 const policy:AiRoutePolicy={allowedProviders:["compatible"],allowedDataClasses:["internal"],maxOutputTokens:256,maxAttempts:1,maxLatencyMs:1000};
 const result=await core.generateRouted(request,{organizationId:"org-1",dataClass:"internal"},policy);
 assert.ok(!result.outputText.includes("abc.def.ghi"));
 assert.ok(!result.outputText.includes("+228 90123456"));
 assert.ok(result.outputText.includes("[REDACTED]"));
});

test("AI Core scrubs prompt and RAG context before sending to providers",async()=>{
 let observed:AiGenerateRequest|undefined;
 const core=makeCore("safe answer",request=>{observed=request;});
 const input:AiGenerateRequest={model:"test-model",messages:[
  {role:"system",content:"Use only authorized context."},
  {role:"user",content:"Contact person@example.com at +228 90123456. API token: ghp_abcdefghijklmnopqrstuvwxyz1234567890"}
 ],maxOutputTokens:256,metadata:{source:"rag",contact:"person@example.com"}};
 await core.generate(input);
 assert.ok(observed);
 const serialized=JSON.stringify(observed);
 assert.ok(!serialized.includes("person@example.com"));
 assert.ok(!serialized.includes("+228 90123456"));
 assert.ok(!serialized.includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890"));
 assert.ok(serialized.includes("[REDACTED_EMAIL]"));
 assert.ok(serialized.includes("[REDACTED_API_TOKEN]"));
});
