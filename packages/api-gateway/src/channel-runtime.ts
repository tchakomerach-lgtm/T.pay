import {normalizeChannelIngress,type ChannelIngressInput,type CanonicalChannelIngress} from "./channel-ingress.js";
import {ApiRuntimeGate,type RuntimeDecision} from "./runtime-gate.js";
import type {ChannelIngressRepository,IngressRecordResult} from "./channel-repository.js";

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
},runtime:ApiRuntimeGate,repository:ChannelIngressRepository):Promise<ChannelRuntimeResult>{
  const ingress=normalizeChannelIngress(input);
  const runtimeDecision=await runtime.evaluate({
    method:ingress.method,route:ingress.route,authClass:input.authClass,
    channel:ingress.channel,origin:ingress.origin,correlationId:ingress.correlationId,
    scopeSecrets:input.scopeSecrets,now:input.now,
    ...(input.organizationId===undefined?{}:{organizationId:input.organizationId})
  });
  if(!runtimeDecision.allowed)return {runtime:runtimeDecision,ingress};
  const evidence=await repository.record(ingress,input.organizationId);
  return {runtime:runtimeDecision,ingress,evidence};
}
