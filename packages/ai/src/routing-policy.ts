import type { AiProvider, AiProviderRegistry } from "./provider.js";

export type AiDataClass = "public"|"internal"|"confidential"|"sensitive_financial"|"sensitive_identity"|"sensitive_health";

export interface AiRoutePolicy {
  readonly allowedProviders: readonly string[];
  readonly allowedDataClasses: readonly AiDataClass[];
  readonly requiredProvider?: string;
  readonly maxOutputTokens: number;
  readonly maxAttempts: number;
  readonly maxLatencyMs: number;
}

export interface AiRequestClassification {
  readonly organizationId: string;
  readonly dataClass: AiDataClass;
  readonly residency?: string;
  readonly requiredCapability?: string;
}

export interface RoutedProvider {
  readonly provider: AiProvider;
  readonly attempt: number;
}

export function selectProviders(
  registry: AiProviderRegistry,
  policy: AiRoutePolicy,
  classification: AiRequestClassification
): readonly RoutedProvider[] {
  if(!policy.allowedDataClasses.includes(classification.dataClass)) throw new Error("AI_DATA_CLASS_NOT_ALLOWED");
  if(policy.maxOutputTokens<1 || policy.maxOutputTokens>200000) throw new Error("AI_OUTPUT_BUDGET_INVALID");
  if(policy.maxAttempts<1 || policy.maxAttempts>5) throw new Error("AI_ATTEMPT_BUDGET_INVALID");
  const providers=registry.list().filter(p=>policy.allowedProviders.includes(p.id));
  if(policy.requiredProvider){
    const required=providers.find(p=>p.id===policy.requiredProvider);
    if(!required) throw new Error("AI_REQUIRED_PROVIDER_UNAVAILABLE");
    return [{provider:required,attempt:1}];
  }
  return providers.slice(0,policy.maxAttempts).map((provider,index)=>({provider,attempt:index+1}));
}
