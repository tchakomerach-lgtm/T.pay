import type {AiModelRequest,AiModelResponse} from "./provider-adapter.js";
import {AiProviderRegistry,assertProviderRouteAllowed} from "./provider-adapter.js";
import type {ModelRoute,RoutePolicy} from "./model-router.js";
import {routeModel} from "./model-router.js";
import {ProviderCircuitBreaker,executeProvider,type ProviderRuntimePolicy} from "./provider-runtime.js";

export interface AiRouteAttempt {route:ModelRoute;providerRequestId?:string;status:"succeeded"|"failed"|"blocked";reason?:string;}
export interface AiModelGatewayResult {response:AiModelResponse;attempts:AiRouteAttempt[];}

export class AiModelGateway {
  private readonly breakers=new Map<string,ProviderCircuitBreaker>();
  constructor(private readonly registry:AiProviderRegistry){}
  async generate(request:AiModelRequest,policy:RoutePolicy,runtime:Omit<ProviderRuntimePolicy,"allowExternal"|"dataClass">):Promise<AiModelGatewayResult>{
    const primary=routeModel(policy);
    const routes=[primary];
    if(policy.dataClass==="public"||policy.dataClass==="internal"){
      if(primary.provider==="anthropic") routes.push({provider:"openai",model:"gpt",purpose:primary.purpose,maxInputTokens:primary.maxInputTokens});
      else if(primary.provider==="openai"&&policy.allowAnthropic) routes.push({provider:"anthropic",model:"claude",purpose:primary.purpose,maxInputTokens:primary.maxInputTokens});
    }
    const attempts:AiRouteAttempt[]=[];
    for(const route of routes){
      try{
        assertProviderRouteAllowed(route,policy.dataClass,policy.allowExternal);
        const key=route.provider+":"+route.model;
        const breaker=this.breakers.get(key)??new ProviderCircuitBreaker(runtime.circuit);
        this.breakers.set(key,breaker);
        const adapter=this.registry.resolve(route);
        const response=await executeProvider(adapter,request,route,{...runtime,allowExternal:policy.allowExternal,dataClass:policy.dataClass},breaker);
        attempts.push({route,providerRequestId:response.providerRequestId,status:"succeeded"});
        return {response,attempts};
      }catch(error){
        attempts.push({route,status:"failed",reason:error instanceof Error?error.message:"AI_PROVIDER_FAILED"});
      }
    }
    throw new Error("AI_ALL_PROVIDER_ROUTES_FAILED");
  }
}
