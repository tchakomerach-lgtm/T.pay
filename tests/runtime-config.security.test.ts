import assert from "node:assert/strict";
import test from "node:test";
import {readRuntimeConfig} from "../apps/api-server/src/main.js";

const base={
  TPAY_DATABASE_URL:"postgresql://localhost/tpay",
  TPAY_TLS_KEY_FILE:"/tmp/tpay.key",
  TPAY_TLS_CERT_FILE:"/tmp/tpay.crt"
};

test("P050 runtime config accepts canonical HTTPS CORS origins",()=>{
  const config=readRuntimeConfig({...base,TPAY_WEB_ORIGINS:"https://tpay.example,https://app.tpay.example:8443"});
  assert.deepEqual(config.webOrigins,["https://tpay.example","https://app.tpay.example:8443"]);
});

test("P050 runtime config rejects plaintext, wildcard and non-canonical CORS origins",()=>{
  for(const origin of [
    "http://tpay.example",
    "*",
    "https://tpay.example/path",
    "https://user:pass@tpay.example",
    "https://tpay.example/?x=1"
  ]){
    assert.throws(()=>readRuntimeConfig({...base,TPAY_WEB_ORIGINS:origin}),/TPAY_WEB_ORIGIN_/);
  }
});
