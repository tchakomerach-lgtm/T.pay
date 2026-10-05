export type AiProviderId = "openai" | "anthropic" | "compatible" | (string & {});

export interface AiMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface AiGenerateRequest {
  readonly model: string;
  readonly messages: readonly AiMessage[];
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  readonly metadata?: Readonly<Record<string,string>>;
}

export interface AiGenerateResponse {
  readonly provider: string;
  readonly model: string;
  readonly requestId: string;
  readonly outputText: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
}

export interface AiProvider {
  readonly id: AiProviderId;
  readonly priority: number;
  readonly enabled: boolean;
  generate(request: AiGenerateRequest, signal?: AbortSignal): Promise<AiGenerateResponse>;
}

export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();

  register(provider: AiProvider): void {
    if (!provider.id || !provider.enabled) throw new Error("AI_PROVIDER_NOT_ACTIVE");
    if (this.providers.has(provider.id)) throw new Error("AI_PROVIDER_ALREADY_REGISTERED");
    this.providers.set(provider.id, provider);
  }

  list(): readonly AiProvider[] {
    return [...this.providers.values()].sort((a,b) => a.priority - b.priority);
  }

  get(id: string): AiProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error("AI_PROVIDER_NOT_FOUND");
    return provider;
  }
}
