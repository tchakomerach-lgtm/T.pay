import test from "node:test";
import assert from "node:assert/strict";
import { TPayApi } from "../apps/experience-web/src/api.js";

test("web API command reuses idempotency key after ambiguous network failure and rotates after success", async () => {
  const originalFetch = globalThis.fetch;
  const keys: string[] = [];
  let shouldFail = true;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    keys.push(headers.get("x-idempotency-key") ?? "");
    if (shouldFail) {
      shouldFail = false;
      throw new TypeError("simulated network interruption");
    }
    return new Response(JSON.stringify({ data: { accepted: true } }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  try {
    const api = new TPayApi({
      apiBaseUrl: "https://api.tpay.test",
      accessToken: "test-session-token",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const command = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: "group-1", amountMinor: "5000" })
    };
    await assert.rejects(api.command("/v1/tontine/contributions", command), /simulated network interruption/);
    const retry = await api.command("/v1/tontine/contributions", command);
    assert.equal(retry.status, 200);
    const nextOperation = await api.command("/v1/tontine/contributions", command);
    assert.equal(nextOperation.status, 200);
    assert.equal(keys.length, 3);
    assert.ok(keys[0] && keys[0].length > 20, "first command must receive a non-empty idempotency key");
    assert.equal(keys[0], keys[1], "ambiguous retry must reuse the original key");
    assert.notEqual(keys[1], keys[2], "a confirmed command must release its key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("web API command uses distinct keys for different command payloads", async () => {
  const originalFetch = globalThis.fetch;
  const keys: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get("x-idempotency-key") ?? "");
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const api = new TPayApi({
      apiBaseUrl: "https://api.tpay.test",
      accessToken: "test-session-token",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    await api.command("/v1/tontine/contributions", { method: "POST", body: '{"amountMinor":"5000"}' });
    await api.command("/v1/tontine/contributions", { method: "POST", body: '{"amountMinor":"7500"}' });
    assert.notEqual(keys[0], keys[1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
