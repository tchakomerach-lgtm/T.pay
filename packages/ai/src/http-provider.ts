import { randomUUID } from "node:crypto";
import { SecureHttpsAdapter, type AllowedEndpoint } from "../../integrations/src/secure-http-adapter.js";
import type { AiGenerateRequest, AiGenerateResponse, AiProvider, AiProviderId } from "./provider.js";

export interface AiHttpProviderConfig {
  readonly id: AiProviderId;
  readonly endpoint: string;
  readonly apiKey: string;
  readonly priority: number;
  readonly requestTimeoutMs: number;
  readonly extraHeaders?: Readonly<Record<string,string>>;
  readonly allowedEndpoints: readonly AllowedEndpoint[];
}

function assertAllowedEndpoint(endpoint: string, allowed: readonly AllowedEndpoint[]): URL {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("AI_PROVIDER_ENDPOINT_INVALID"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("AI_PROVIDER_ENDPOINT_MUST_USE_HTTPS");
  }
  const accepted = allowed.some(entry => {
    const prefix = entry.pathPrefix.endsWith("/") ? entry.pathPrefix : entry.pathPrefix + "/";
    return url.origin === entry.origin && (url.pathname === entry.pathPrefix || url.pathname.startsWith(prefix));
  });
  if (!accepted) throw new Error("AI_PROVIDER_ENDPOINT_NOT_ALLOWLISTED");
  return url;
}

export class HttpJsonAiProvider implements AiProvider {
  readonly enabled = true;
  readonly id: AiProviderId;
  readonly priority: number;
  private readonly endpoint: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly extraHeaders: Readonly<Record<string,string>>;
  private readonly adapter: SecureHttpsAdapter;

  constructor(config: AiHttpProviderConfig) {
    this.id = config.id;
    this.priority = config.priority;
    this.endpoint = assertAllowedEndpoint(config.endpoint, config.allowedEndpoints);
    this.apiKey = config.apiKey;
    this.timeoutMs = Math.max(1000, Math.min(config.requestTimeoutMs, 120000));
    this.extraHeaders = config.extraHeaders ?? {};
    if (!config.allowedEndpoints.length) throw new Error("AI_PROVIDER_ALLOWLIST_REQUIRED");
    this.adapter = new SecureHttpsAdapter(config.allowedEndpoints, undefined, undefined, this.timeoutMs, 1);
    if (!this.apiKey) throw new Error("AI_PROVIDER_SECRET_REQUIRED");
  }

  async generate(request: AiGenerateRequest, signal?: AbortSignal): Promise<AiGenerateResponse> {
    const response = await this.adapter.request({
      url: this.endpoint.toString(),
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        ...this.extraHeaders,
      },
      body: new TextEncoder().encode(JSON.stringify(request)),
      idempotent: false,
      correlationId: randomUUID(),
      ...(signal ? { signal } : {}),
    });
    if (response.state !== "CONFIRMED" || response.body === null) {
      if (response.status !== null) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
      throw new Error(signal?.aborted ? "AI_PROVIDER_REQUEST_ABORTED" : "AI_PROVIDER_TRANSPORT_UNKNOWN");
    }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)); }
    catch { throw new Error("AI_PROVIDER_RESPONSE_INVALID"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI_PROVIDER_RESPONSE_INVALID");
    const record = parsed as Record<string,unknown>;
    const output = typeof record.output_text === "string"
      ? record.output_text
      : typeof record.content === "string" ? record.content : undefined;
    if (!output) throw new Error("AI_PROVIDER_OUTPUT_MISSING");
    const requestId = typeof record.id === "string" ? record.id : randomUUID();
    return { provider: this.id, model: request.model, requestId, outputText: output };
  }
}
