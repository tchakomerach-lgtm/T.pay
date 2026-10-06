import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2500,
  jitterRatio: 0.2,
};

export type ClientMetric = {
  name: string;
  at: string;
  durationMs?: number;
  status?: number;
  retryCount?: number;
  queued?: boolean;
  attributes?: Record<string, string | number | boolean>;
};

const CACHE_PREFIX = "tpay.runtime.cache.";
const OUTBOX_KEY = "tpay.runtime.outbox.v1";
const CACHE_MAX_BYTES = 512_000;
const OUTBOX_MAX_ITEMS = 100;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<{ response: Response; retryCount: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, policy.maxAttempts); attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!shouldRetryStatus(response.status) || attempt >= policy.maxAttempts) {
        return { response, retryCount: attempt - 1 };
      }
      const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
      const serverDelay = retryAfterMs(response);
      const jitter = exponential * policy.jitterRatio * (Math.random() * 2 - 1);
      await delay(Math.min(policy.maxDelayMs, Math.max(0, serverDelay ?? exponential + jitter)));
    } catch (error) {
      lastError = error;
      if (attempt >= policy.maxAttempts) throw error;
      const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
      const jitter = exponential * policy.jitterRatio * (Math.random() * 2 - 1);
      await delay(Math.min(policy.maxDelayMs, Math.max(0, exponential + jitter)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("RUNTIME_RETRY_EXHAUSTED");
}

type CacheEntry<T> = { expiresAt: number; value: T };

export class RuntimeCache {
  private memory = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | undefined> {
    const memory = this.memory.get(key);
    if (memory && memory.expiresAt > Date.now()) return memory.value as T;
    if (memory) this.memory.delete(key);
    try {
      const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (entry.expiresAt <= Date.now()) {
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
        return undefined;
      }
      this.memory.set(key, entry as CacheEntry<unknown>);
      return entry.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const raw = JSON.stringify({ expiresAt: Date.now() + ttlMs, value });
    if (new TextEncoder().encode(raw).byteLength > CACHE_MAX_BYTES) return;
    const entry = { expiresAt: Date.now() + ttlMs, value };
    this.memory.set(key, entry);
    try { await AsyncStorage.setItem(CACHE_PREFIX + key, raw); } catch { /* cache is best effort */ }
  }

  async remove(key: string): Promise<void> {
    this.memory.delete(key);
    try { await AsyncStorage.removeItem(CACHE_PREFIX + key); } catch { /* best effort */ }
  }
}

export type OutboxItem = {
  id: string;
  path: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: string;
  idempotencyKey: string;
  createdAt: string;
};

export class OfflineOutbox {
  private loaded = false;
  private items: OutboxItem[] = [];

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await AsyncStorage.getItem(OUTBOX_KEY);
      if (raw) this.items = JSON.parse(raw) as OutboxItem[];
    } catch { this.items = []; }
  }

  private async persist(): Promise<void> {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(this.items.slice(-OUTBOX_MAX_ITEMS)));
  }

  async list(): Promise<OutboxItem[]> {
    await this.load();
    return [...this.items];
  }

  async enqueue(item: OutboxItem): Promise<void> {
    await this.load();
    if (this.items.some(existing => existing.idempotencyKey === item.idempotencyKey)) return;
    if (this.items.length >= OUTBOX_MAX_ITEMS) throw new Error("OFFLINE_OUTBOX_FULL");
    this.items.push(item);
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    await this.load();
    this.items = this.items.filter(item => item.id !== id);
    await this.persist();
  }
}

export class ClientObservability {
  private readonly events: ClientMetric[] = [];
  private readonly maxEvents = 200;

  record(event: ClientMetric): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  snapshot(): ClientMetric[] {
    return [...this.events];
  }

  async flush(send: (events: ClientMetric[]) => Promise<void>): Promise<void> {
    if (!this.events.length) return;
    const batch = this.snapshot();
    try {
      await send(batch);
      this.events.splice(0, batch.length);
    } catch {
      // Telemetry must never block product operations.
    }
  }
}

export function isNative(): boolean {
  return Platform.OS !== "web";
}

export function makeIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `tpay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
