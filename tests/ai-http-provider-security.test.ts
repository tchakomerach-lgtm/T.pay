import test from "node:test";
import assert from "node:assert/strict";
import {HttpJsonAiProvider} from "../packages/ai/src/http-provider.js";
import type {AiGenerateRequest} from "../packages/ai/src/provider.js";

const request:AiGenerateRequest={model:"test-model",messages:[{role:"user",content:"Contact person@example.com at +228 90123456"}],maxOutputTokens:64};

test("HTTP AI provider rejects credential override and unsafe endpoint configuration",()=>{
 assert.throws(()=>new HttpJsonAiProvider({id:"compatible",endpoint:"http://provider.example/api",apiKey:"test-key",priority:1,requestTimeoutMs:5000}),/AI_PROVIDER_ENDPOINT_MUST_USE_HTTPS/);
 assert.throws(()=>new HttpJsonAiProvider({id:"compatible",endpoint:"https://provider.example/api",apiKey:"test-key",priority:1,requestTimeoutMs:5000,extraHeaders:{Authorization:"Bearer attacker"}}),/AI_PROVIDER_HEADER_OVERRIDE_FORBIDDEN/);
 assert.throws(()=>new HttpJsonAiProvider({id:"compatible",endpoint:"https://provider.example/api",apiKey:"test-key",priority:1,requestTimeoutMs:5000,extraHeaders:{"x-test":"safe\r\ninjected"}}),/AI_PROVIDER_HEADER_NEWLINE_FORBIDDEN/);
});

test("HTTP AI provider scrubs direct prompt input and provider output",async()=>{
 const originalFetch=globalThis.fetch;
 let observed:unknown;
 globalThis.fetch=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
  observed=JSON.parse(String(init?.body??"{}"));
  return new Response(JSON.stringify({id:"44444444-4444-4444-8444-444444444444",output_text:"Reply to person@example.com; provider token ghp_abcdefghijklmnopqrstuvwxyz1234567890"}),{status:200,headers:{"content-type":"application/json"}});
 }) as typeof fetch;
 try{
  const provider=new HttpJsonAiProvider({id:"compatible",endpoint:"https://provider.example/api",apiKey:"test-key",priority:1,requestTimeoutMs:5000});
  const result=await provider.generate(request);
  const sent=JSON.stringify(observed)??"";
  assert.ok(!sent.includes("person@example.com"));
  assert.ok(!sent.includes("+228 90123456"));
  assert.ok(sent.includes("[REDACTED_EMAIL]"));
  assert.ok(!result.outputText.includes("person@example.com"));
  assert.ok(!result.outputText.includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890"));
  assert.ok(result.outputText.includes("[REDACTED_EMAIL]"));
  assert.equal(result.requestId,"44444444-4444-4444-8444-444444444444");
 }finally{globalThis.fetch=originalFetch;}
});

test("HTTP AI provider rejects oversized provider responses without parsing them",async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(async()=>new Response("x".repeat(1_000_001),{status:200})) as typeof fetch;
 try{
  const provider=new HttpJsonAiProvider({id:"compatible",endpoint:"https://provider.example/api",apiKey:"test-key",priority:1,requestTimeoutMs:5000});
  await assert.rejects(provider.generate(request),/AI_PROVIDER_RESPONSE_SIZE_LIMIT/);
 }finally{globalThis.fetch=originalFetch;}
});
