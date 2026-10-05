import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceHttpsServer, VOICE_TLS_MAX_VERSION, VOICE_TLS_MIN_VERSION, type VoiceApiPrincipal } from "../packages/api-gateway/src/voice-https-server.js";

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
    async handle({ principal: p }) { assert.equal(p.organizationIds[0], "org-1"); return { statusCode: 200, body: JSON.stringify({ ok: true }) }; },
  });
  assert.ok(server);
  server.close();
});
