export type CircuitState = "closed" | "open" | "half_open";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface CircuitBreakerPolicy {
  failureThreshold: number;
  openForMs: number;
}

export interface ProviderResiliencePolicy {
  retry: RetryPolicy;
  circuit: CircuitBreakerPolicy;
}

export class ProviderCircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;

  constructor(private readonly policy: CircuitBreakerPolicy) {}

  getState(now = Date.now()): CircuitState {
    if (this.state === "open" && now - this.openedAt >= this.policy.openForMs) {
      this.state = "half_open";
    }
    return this.state;
  }

  allow(now = Date.now()): boolean {
    const state = this.getState(now);
    return state !== "open";
  }

  recordSuccess(): void {
    this.state = "closed";
    this.failures = 0;
    this.openedAt = 0;
  }

  recordFailure(now = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.policy.failureThreshold) {
      this.state = "open";
      this.openedAt = now;
    }
  }
}

export function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /TIMEOUT|NETWORK|503|429|TEMPORARY/i.test(error.message);
}

export function boundedBackoffMs(attempt: number, policy: RetryPolicy): number {
  if (attempt < 1) throw new Error("INVALID_RETRY_ATTEMPT");
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(exponential, policy.maxDelayMs);
}

export async function executeProviderCall<T>(
  call: () => Promise<T>,
  policy: ProviderResiliencePolicy,
  breaker: ProviderCircuitBreaker,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms))
): Promise<T> {
  if (!breaker.allow()) throw new Error("PROVIDER_CIRCUIT_OPEN");

  let attempt = 0;
  while (attempt < policy.retry.maxAttempts) {
    attempt += 1;
    try {
      const result = await call();
      breaker.recordSuccess();
      return result;
    } catch (error) {
      breaker.recordFailure();
      if (!isRetryableProviderError(error) || attempt >= policy.retry.maxAttempts) throw error;
      await sleep(boundedBackoffMs(attempt, policy.retry));
      if (!breaker.allow()) throw new Error("PROVIDER_CIRCUIT_OPEN");
    }
  }
  throw new Error("PROVIDER_RETRY_EXHAUSTED");
}
