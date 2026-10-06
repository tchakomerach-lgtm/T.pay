import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("web server contains mandatory transport security controls",async()=>{
 const source=await readFile("scripts/web-server.mjs","utf8");
 assert.match(source,/TLSv1\.3/);
 assert.match(source,/strict-transport-security/);
 assert.match(source,/content-security-policy/);
 assert.match(source,/x-content-type-options/);
 assert.match(source,/TLS_CERTIFICATE_REQUIRED_IN_PRODUCTION/);
});

test("production cannot start without certificate material",async()=>{
 const source=await readFile("scripts/web-server.mjs","utf8");
 assert.match(source,/isProduction && \(!tlsKey \|\| !tlsCert\)/);
});
