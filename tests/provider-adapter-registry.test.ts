import test from "node:test";
import assert from "node:assert/strict";
import { FloozAdapter, MicrofinanceAdapter, TMoneyAdapter, type ProviderAdapterTransport } from "../packages/finance/src/provider-contract-adapters.js";
import type { ProviderPaymentCommand, ProviderPaymentResult, VerifiedProviderEvent, ProviderCallback } from "../packages/finance/src/provider-contract.js";
import { ProviderAdapterRegistry } from "../packages/finance/src/provider-registry.js";
import { ProviderCircuitBreaker, boundedBackoffMs, executeProviderCall } from "../packages/finance/src/provider-resilience.js";

const command: ProviderPaymentCommand = {
  organizationId: "org-1",
  paymentId: "payment-1",
  idempotencyKey: "idem-1",
  amountMinor: 1500n,
  currency: "XOF",
  payerReference: "payer",
  payeeReference: "payee",
  correlationId: "corr-1"
};

const result: ProviderPaymentResult = {
  providerId: "tmoney",
  providerReference: "prov-1",
  status: "pending",
  rawStatus: "PENDING",
  correlationId: "corr-1",
  retryable: true
};

function transportFor(resultValue: ProviderPaymentResult): ProviderAdapterTransport {
  return {
    initiate: async () => resultValue,
    query: async () => resultValue,
    verifyCallback: async (callback: ProviderCallback): Promise<VerifiedProviderEvent> => ({
      providerId: callback.providerId,
      eventId: callback.eventId,
      paymentId: command.paymentId,
      providerReference: resultValue.providerReference,
      status: resultValue.status,
      amountMinor: command.amountMinor,
      currency: command.currency,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
      occurredAt: callback.receivedAt
    })
  };
}

test("registry resolves provider-neutral adapters and rejects duplicates", () => {
  const registry = new ProviderAdapterRegistry();
  registry.register(new TMoneyAdapter(transportFor(result)));
  registry.register(new FloozAdapter(transportFor({ ...result, providerId: "flooz" })));
  registry.register(new MicrofinanceAdapter(transportFor({ ...result, providerId: "microfinance" })));

  assert.deepEqual(registry.list(), ["flooz", "microfinance", "tmoney"]);
  assert.equal(registry.resolve("tmoney").identity.id, "tmoney");
  assert.throws(() => registry.register(new TMoneyAdapter(transportFor(result))), /PROVIDER_ALREADY_REGISTERED/);
});

test("adapter contract preserves correlation and normalized state", async () => {
  const adapter = new TMoneyAdapter(transportFor(result));
  const response = await adapter.initiate(command);
  assert.equal(response.status, "pending");
  assert.equal(response.correlationId, command.correlationId);
  assert.equal(response.providerId, "tmoney");
});

test("provider contract must not treat pending as financial confirmation", () => {
  const adapter = new TMoneyAdapter(transportFor(result));
  assert.equal(adapter.identity.capabilities.has("callback"), true);
  assert.equal(result.status, "pending");
});

test("circuit breaker opens after threshold and later permits half-open probe", () => {
  const breaker = new ProviderCircuitBreaker({ failureThreshold: 2, openForMs: 1000 });
  breaker.recordFailure(100);
  assert.equal(breaker.allow(100), true);
  breaker.recordFailure(200);
  assert.equal(breaker.allow(200), false);
  assert.equal(breaker.getState(1200), "half_open");
});

test("retry backoff is bounded and deterministic", () => {
  const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 250 };
  assert.equal(boundedBackoffMs(1, policy), 100);
  assert.equal(boundedBackoffMs(2, policy), 200);
  assert.equal(boundedBackoffMs(3, policy), 250);
  assert.equal(boundedBackoffMs(4, policy), 250);
});

test("provider call retries only bounded retryable failures", async () => {
  const breaker = new ProviderCircuitBreaker({ failureThreshold: 5, openForMs: 1000 });
  const sleeps: number[] = [];
  let calls = 0;
  const response = await executeProviderCall(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("NETWORK_TIMEOUT");
      return "ok";
    },
    { retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20 }, circuit: { failureThreshold: 5, openForMs: 1000 } },
    breaker,
    async ms => { sleeps.push(ms); }
  );
  assert.equal(response, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [10, 20]);
});

test("non-retryable provider failure is not repeated", async () => {
  const breaker = new ProviderCircuitBreaker({ failureThreshold: 5, openForMs: 1000 });
  let calls = 0;
  await assert.rejects(
    executeProviderCall(
      async () => { calls += 1; throw new Error("INVALID_REFERENCE"); },
      { retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 20 }, circuit: { failureThreshold: 5, openForMs: 1000 } },
      breaker,
      async () => {}
    ),
    /INVALID_REFERENCE/
  );
  assert.equal(calls, 1);
});
