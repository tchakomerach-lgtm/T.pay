import test from "node:test";
import assert from "node:assert/strict";
import {AiProviderRegistry,assertProviderRouteAllowed,type AiProviderAdapter} from "../packages/ai-core/src/provider-adapter.js";
import {requireSecret} from "../packages/ai-core/src/secret-boundary.js";

const local:AiProviderAdapter={provider:"local",async generate(){return {provider:"local",model:"safe",text:"ok",inputTokens:1,outputTokens:1,finishReason:"stop"}}};
test("L11.3 registry requires explicitly configured provider",()=>{
  const registry=new AiProviderRegistry();
  assert.throws(()=>registry.resolve({provider:"openai",model:"gpt",purpose:"reasoning",maxInputTokens:100}),/NOT_CONFIGURED/);
  registry.register(local);
  assert.equal(registry.resolve({provider:"local",model:"safe",purpose:"safety",maxInputTokens:100}),local);
});
test("L11.3 sensitive and financial data cannot leave local route",()=>{
  assert.doesNotThrow(()=>assertProviderRouteAllowed({provider:"local",model:"safe",purpose:"safety",maxInputTokens:100},"financial",false));
  assert.throws(()=>assertProviderRouteAllowed({provider:"openai",model:"gpt",purpose:"reasoning",maxInputTokens:100},"financial",true),/SENSITIVE_DATA/);
});
test("L11.3 secrets are resolved through a boundary, never literals",async()=>{
  await assert.rejects(()=>requireSecret({resolve:async()=>undefined},"OPENAI_API_KEY"),/NOT_CONFIGURED/);
  assert.equal(await requireSecret({resolve:async()=> "secret"},"OPENAI_API_KEY"),"secret");
});
