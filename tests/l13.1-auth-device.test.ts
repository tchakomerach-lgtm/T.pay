import {strict as assert} from "node:assert";
import {test} from "node:test";
import {assertHttpsOrigin,hashCredential} from "../packages/api-gateway/src/auth-device.js";
test("L13.1 hashes credentials without exposing plaintext",()=>{const h=hashCredential("1234567890abcdef");assert.match(h,/^[a-f0-9]{64}$/);assert.notEqual(h,"1234567890abcdef");});
test("L13.1 rejects HTTP adapters",()=>{assert.throws(()=>assertHttpsOrigin("http://api.example.tg"),/AUTH_HTTPS_REQUIRED/);assert.doesNotThrow(()=>assertHttpsOrigin("https://api.example.tg"));});
