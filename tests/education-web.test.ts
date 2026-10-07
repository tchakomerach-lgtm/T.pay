import test from "node:test";
import assert from "node:assert/strict";
import {createSchoolWebClient} from "../apps/education-web/src/school-web.js";

test("P045 School web client enforces HTTPS and session expiry",async()=>{
  const config={apiBaseUrl:"https://school.example",session:{accessToken:"short-lived-token",expiresAt:new Date(Date.now()+60000).toISOString()}};
  const client=createSchoolWebClient(config);
  const original=globalThis.fetch;
  let captured:RequestInit|undefined;
  globalThis.fetch=async(_input,init)=>{captured=init;return new Response("{}",{status:200,headers:{"content-type":"application/json"}});};
  try{
    await client.mutate("/v1/education/work-items",{id:"w1"});
    const headers=new Headers(captured?.headers);assert.equal(headers.get("authorization"),"Bearer short-lived-token");assert.ok(headers.get("x-idempotency-key"));
    assert.equal(headers.get("x-tenant-id"),null);
  }finally{globalThis.fetch=original;}
  assert.throws(()=>createSchoolWebClient({apiBaseUrl:"http://school.example",session:config.session}),/WEB_HTTPS_REQUIRED/);
  assert.throws(()=>createSchoolWebClient({apiBaseUrl:"https://school.example",session:{...config.session,expiresAt:new Date(Date.now()-1).toISOString()}}).request("/v1/education/actors/current"),/WEB_SESSION_EXPIRED/);
});
