export type ResilienceErrorClass="transient"|"permanent";
export type CircuitState="closed"|"open"|"half_open";

export interface RetryPolicy {maxAttempts:number;baseDelayMs:number;maxDelayMs:number;}
export function classifyResilienceError(error:unknown):ResilienceErrorClass{
  if(error instanceof Error&&/TIMEOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|429|503/i.test(error.message))return "transient";
  return "permanent";
}
export function boundedBackoff(attempt:number,policy:RetryPolicy):number{
  if(!Number.isInteger(attempt)||attempt<1)throw new Error("RETRY_ATTEMPT_INVALID");
  return Math.min(policy.maxDelayMs,policy.baseDelayMs*2**(attempt-1));
}

export class CircuitBreaker {
  private state:CircuitState="closed";
  private failures=0;
  private openedAt=0;
  constructor(private readonly failureThreshold:number,private readonly resetAfterMs:number){
    if(!Number.isInteger(failureThreshold)||failureThreshold<1)throw new Error("CIRCUIT_THRESHOLD_INVALID");
    if(!Number.isInteger(resetAfterMs)||resetAfterMs<1)throw new Error("CIRCUIT_RESET_INVALID");
  }
  getState(now=Date.now()):CircuitState{
    if(this.state==="open"&&now-this.openedAt>=this.resetAfterMs)this.state="half_open";
    return this.state;
  }
  allow(now=Date.now()):boolean{
    const state=this.getState(now);
    return state!=="open";
  }
  onSuccess():void{this.state="closed";this.failures=0;this.openedAt=0;}
  onFailure(now=Date.now()):void{
    this.failures+=1;
    if(this.state==="half_open"||this.failures>=this.failureThreshold){
      this.state="open";this.openedAt=now;
    }
  }
}

export async function executeWithResilience<T>(
  operation:()=>Promise<T>,
  options:{timeoutMs:number;retry:RetryPolicy;circuit:CircuitBreaker;sleep:(ms:number)=>Promise<void>;now?:()=>number}
):Promise<T>{
  if(!Number.isInteger(options.timeoutMs)||options.timeoutMs<1)throw new Error("TIMEOUT_INVALID");
  const now=options.now??Date.now;
  for(let attempt=1;attempt<=options.retry.maxAttempts;attempt++){
    if(!options.circuit.allow(now()))throw new Error("CIRCUIT_OPEN");
    try{
      const value=await Promise.race([
        operation(),
        new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("TIMEOUT")),options.timeoutMs))
      ]);
      options.circuit.onSuccess();
      return value;
    }catch(error){
      options.circuit.onFailure(now());
      if(classifyResilienceError(error)!=="transient"||attempt===options.retry.maxAttempts)throw error;
      await options.sleep(boundedBackoff(attempt,options.retry));
    }
  }
  throw new Error("RESILIENCE_UNREACHABLE");
}
