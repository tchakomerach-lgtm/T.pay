import {normalizeChannelIngress,type ChannelIngressInput,type CanonicalChannelIngress} from "./channel-ingress.js";
import {ApiRuntimeGate,type RuntimeDecision} from "./runtime-gate.js";
import type {ChannelIngressRepository,IngressRecordResult} from "./channel-repository.js";
import type {ApiObservabilityRepository} from "./api-observability.js";

export interface ChannelRuntimeResult{
  runtime:RuntimeDecision;
  ingress?:CanonicalChannelIngress;
  evidence?:IngressRecordResult;
}

export async function processChannelIngress(input:ChannelIngressInput&{
  authClass:"anonymous"|"user"|"member"|"admin"|"service";
  organizationId?:string;
  scopeSecrets:Partial<Record<"ip"|"device"|"actor"|"organization"|"phone"|"channel",string>>;
  now:string;
},runtime:ApiRuntimeGate,repository:ChannelIngressRepository,observability?:ApiObservabilityRepository):Promise<ChannelRuntimeResult>{
  const ingress=normalizeChannelIngress(input);
  const runtimeDecision=await runtime.evaluate({
    method:ingress.method,route:ingress.route,authClass:input.authClass,
    channel:ingress.channel,origin:ingress.origin,correlationId:ingress.correlationId,
    scopeSecrets:input.scopeSecrets,now:input.now,
    ...(input.organizationId===undefined?{}:{organizationId:input.organizationId})
  });
  if(observability){
    await observability.record({
      ...(input.organizationId===undefined?{}:{organizationId:input.organizationId}),
      correlationId:ingress.correlationId,route:ingress.route,method:ingress.method,
      apiVersion:ingress.route.match(/^\\/v[0-9]+/)?.[0]??"v1",channel:ingress.channel,
      statusCode:runtimeDecision.allowed?200:runtimeDecision.status,
      outcome:runtimeDecision.allowed?"success":runtimeDecision.status===429?"limited":"blocked",
      errorCode:runtimeDecision.allowed?undefined:runtimeDecision.code,
      durationMs:0,occurredAt:input.now
    });
  }
  if(!runtimeDecision.allowed)return {runtime:runtimeDecision,ingress};
  const evidence=await repository.record(ingress,input.organizationId);
  return {runtime:runtimeDecision,ingress,evidence};
}
