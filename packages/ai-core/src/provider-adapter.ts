import type {AiProvider,ModelRoute} from "./model-router.js";

export interface AiModelRequest {
  requestId:string;
  organizationId?:string;
  systemPrompt:string;
  userPrompt:string;
  maxOutputTokens:number;
}

export interface AiModelResponse {
  provider:AiProvider;
  model:string;
  text:string;
  inputTokens:number;
  outputTokens:number;
  finishReason:"stop"|"length"|"tool_required";
  providerRequestId?:string;
}

export interface AiProviderAdapter {
  readonly provider:AiProvider;
  generate(request:AiModelRequest,route:ModelRoute):Promise<AiModelResponse>;
}

export class AiProviderRegistry {
  private readonly adapters=new Map<AiProvider,AiProviderAdapter>();
  register(adapter:AiProviderAdapter):void {
    if(this.adapters.has(adapter.provider)) throw new Error("AI_PROVIDER_ALREADY_REGISTERED");
    this.adapters.set(adapter.provider,adapter);
  }
  resolve(route:ModelRoute):AiProviderAdapter {
    const adapter=this.adapters.get(route.provider);
    if(!adapter) throw new Error("AI_PROVIDER_NOT_CONFIGURED");
    return adapter;
  }
}

export function assertProviderRouteAllowed(route:ModelRoute, dataClass:"public"|"internal"|"sensitive"|"financial", allowExternal:boolean):void {
  if((dataClass==="sensitive"||dataClass==="financial") && route.provider!=="local")
    throw new Error("AI_EXTERNAL_PROVIDER_FOR_SENSITIVE_DATA_FORBIDDEN");
  if(!allowExternal && route.provider!=="local")
    throw new Error("AI_EXTERNAL_PROVIDER_DISABLED");
  if(route.maxInputTokens<=0) throw new Error("AI_ROUTE_INVALID_LIMIT");
}
