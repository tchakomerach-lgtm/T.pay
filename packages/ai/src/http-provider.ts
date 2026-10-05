import type { AiGenerateRequest, AiGenerateResponse, AiProvider, AiProviderId } from "./provider.js";

export interface AiHttpProviderConfig {
  readonly id: AiProviderId;
  readonly endpoint: string;
  readonly apiKey: string;
  readonly priority: number;
  readonly requestTimeoutMs: number;
  readonly extraHeaders?: Readonly<Record<string,string>>;
}

function assertHttpsEndpoint(endpoint: string): URL {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("AI_PROVIDER_ENDPOINT_MUST_USE_HTTPS");
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

  constructor(config: AiHttpProviderConfig) {
    this.id = config.id;
    this.priority = config.priority;
    this.endpoint = assertHttpsEndpoint(config.endpoint);
    this.apiKey = config.apiKey;
    this.timeoutMs = Math.max(1000, Math.min(config.requestTimeoutMs, 120000));
    this.extraHeaders = config.extraHeaders ?? {};
    if (!this.apiKey) throw new Error("AI_PROVIDER_SECRET_REQUIRED");
  }

  async generate(request: AiGenerateRequest, signal?: AbortSignal): Promise<AiGenerateResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const linked = signal;
    if (linked?.aborted) controller.abort();
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error("AI_PROVIDER_RESPONSE_INVALID");
      const record = parsed as Record<string,unknown>;
      const output = typeof record.output_text === "string"
        ? record.output_text
        : typeof record.content === "string" ? record.content : undefined;
      if (!output) throw new Error("AI_PROVIDER_OUTPUT_MISSING");
      const requestId = typeof record.id === "string" ? record.id : crypto.randomUUID();
      return {
        provider: this.id,
        model: request.model,
        requestId,
        outputText: output,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
