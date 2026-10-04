import type {AiModelRequest,AiModelResponse,AiProviderAdapter} from "./provider-adapter.js";
import type {AiProvider,ModelRoute} from "./model-router.js";

export interface RuntimeRetryPolicy {maxAttempts:number;timeoutMs:number;baseDelayMs:number;}
export interface RuntimeCircuitPolicy {failureThreshold:number;cooldownMs:number;}
export interface ProviderRuntimePolicy {
  retry:RuntimeRetryPolicy;
  circuit:RuntimeCircuitPolicy;
  allowExternal:boolean;
  dataClass:"public"|"internal"|"sensitive"|"financial";
}

export class ProviderCircuitBreaker {
  private failures=0;
  private openedAt=0;
  constructor(private readonly policy:RuntimeCircuitPolicy){}
  assertAvailable(now=Date.now()):void{
    if(this.failures<this.policy.failureThreshold)return;
    if(now-this.openedAt>=this.policy.cooldownMs){this.failures=0;this.openedAt=0;return;}
    throw new Error("AI_PROVIDER_CIRCUIT_OPEN");
  }
  success():void{this.failures=0;this.openedAt=0;}
  failure(now=Date.now()):void{
    this.failures++;
    if(this.failures>=this.policy.failureThreshold)this.openedAt=now;
  }
}

export function isTransientProviderError(error:unknown):boolean{
  const code=error instanceof Error?error.message:"";
  return /TIMEOUT|RATE_LIMIT|UNAVAILABLE|TEMPORARY|ECONNRESET|ETIMEDOUT|429|503/i.test(code);
}

export async function withTimeout<T>(work:Promise<T>,timeoutMs:number):Promise<T>{
  if(timeoutMs<1)throw new Error("AI_PROVIDER_TIMEOUT_INVALID");
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("AI_PROVIDER_TIMEOUT")),timeoutMs);});
  try{return await Promise.race([work,timeout]);}finally{if(timer)clearTimeout(timer);}
}

export async function executeProvider(
  adapter:AiProviderAdapter,
  request:AiModelRequest,
  route:ModelRoute,
  policy:ProviderRuntimePolicy,
  breaker:ProviderCircuitBreaker
):Promise<AiModelResponse>{
  if(policy.retry.maxAttempts<1||policy.retry.maxAttempts>5)throw new Error("AI_RETRY_POLICY_INVALID");
  let last:unknown;
  for(let attempt=1;attempt<=policy.retry.maxAttempts;attempt++){
    breaker.assertAvailable();
    try{
      const result=await withTimeout(adapter.generate(request,route),policy.retry.timeoutMs);
      breaker.success();
      return result;
    }catch(error){
      last=error;
      breaker.failure();
      if(!isTransientProviderError(error)||attempt===policy.retry.maxAttempts)throw error;
      await new Promise(resolve=>setTimeout(resolve,Math.min(policy.retry.baseDelayMs*2**(attempt-1),2000)));
    }
  }
  throw last instanceof Error?last:new Error("AI_PROVIDER_EXECUTION_FAILED");
}
