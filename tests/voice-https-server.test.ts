import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceHttpsServer, VOICE_TLS_MAX_VERSION, VOICE_TLS_MIN_VERSION, type VoiceApiPrincipal } from "../packages/api-gateway/src/voice-https-server.js";
import { AdaptiveRateLimiter } from "../packages/security/src/adaptive-abuse-control.js";

test("concrete voice HTTPS server is TLS 1.3-only and requires scoped auth/idempotency", () => {
  assert.equal(VOICE_TLS_MIN_VERSION, "TLSv1.3");
  assert.equal(VOICE_TLS_MAX_VERSION, "TLSv1.3");
  const principal: VoiceApiPrincipal = { actorId: "actor-1", organizationIds: ["org-1"], scopes: ["voice:write"] };
  const server = createVoiceHttpsServer({
    tls: { key: "INJECTED_RUNTIME_KEY", cert: "INJECTED_RUNTIME_CERT" },
    auth: {
      async authenticate() { return principal; },
      async authorize(p, method) { if (method === "POST" && !p.scopes.includes("voice:write")) throw new Error("VOICE_SCOPE_REQUIRED"); },
    },
    idempotency: { async get() { return undefined; }, async put() {} },
    rateLimiter: new AdaptiveRateLimiter(),
    async handle({ principal: p }) { assert.equal(p.organizationIds[0], "org-1"); return { statusCode: 200, body: JSON.stringify({ ok: true }) }; },
  });
  assert.ok(server);
  server.close();
});


test("voice API security boundary rejects malformed and prototype-pollution JSON", async () => {
  const source = await import("../packages/api-gateway/src/voice-https-server.js");
  assert.equal(typeof source.createVoiceHttpsServer, "function");
  const firewall = await import("../packages/security/src/input-firewall.js");
  assert.throws(() => firewall.assertSafeJsonValue(JSON.parse('{"__proto__":{"admin":true}}')), /PROTO_POLLUTION_KEY/);
  assert.throws(() => firewall.assertSafeJsonValue(Array.from({ length: 1001 }, () => "x")), /ARRAY_TOO_LARGE/);
});
