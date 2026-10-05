import test from "node:test";
import assert from "node:assert/strict";
import { secureHttpsRequest } from "../packages/api-gateway/src/secure-http-client.js";

test("provider client refuses non-HTTPS endpoints before network access", async () => {
  await assert.rejects(secureHttpsRequest({ endpoint: new URL("http://provider.example/callback"), method: "POST" }), /HTTPS_REQUIRED/);
});
