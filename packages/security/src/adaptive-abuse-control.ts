export interface RateLimitDecision { readonly allowed:boolean; readonly retryAfterSeconds:number; readonly remaining:number; readonly reason:"OK"|"RATE_LIMITED"|"BRUTE_FORCE"; }
interface Bucket { tokens:number; updatedAt:number; failures:number; blockedUntil:number; }
export interface RateLimitPolicy { readonly capacity:number; readonly refillPerSecond:number; readonly failureThreshold:number; readonly blockSeconds:number; }
const DEFAULT_POLICY:RateLimitPolicy={capacity:30,refillPerSecond:5,failureThreshold:8,blockSeconds:300};
export class AdaptiveRateLimiter {
 private readonly buckets=new Map<string,Bucket>();
 constructor(private readonly policy:RateLimitPolicy=DEFAULT_POLICY){}
 consume(identity:string,now=Date.now(),cost=1):RateLimitDecision{
  if(!identity) throw new Error("RATE_LIMIT_IDENTITY_REQUIRED");
  const p=this.policy,b=this.buckets.get(identity)??{tokens:p.capacity,updatedAt:now,failures:0,blockedUntil:0};
  const elapsed=Math.max(0,(now-b.updatedAt)/1000); b.tokens=Math.min(p.capacity,b.tokens+elapsed*p.refillPerSecond); b.updatedAt=now;
  if(b.blockedUntil>now)return {allowed:false,retryAfterSeconds:Math.ceil((b.blockedUntil-now)/1000),remaining:0,reason:"BRUTE_FORCE"};
  if(b.tokens<cost)return {allowed:false,retryAfterSeconds:Math.ceil((cost-b.tokens)/p.refillPerSecond),remaining:Math.floor(b.tokens),reason:"RATE_LIMITED"};
  b.tokens-=cost; this.buckets.set(identity,b); return {allowed:true,retryAfterSeconds:0,remaining:Math.floor(b.tokens),reason:"OK"};
 }
 recordFailure(identity:string,now=Date.now()):void{
  const p=this.policy,b=this.buckets.get(identity)??{tokens:p.capacity,updatedAt:now,failures:0,blockedUntil:0};
  b.failures++; if(b.failures>=p.failureThreshold){b.blockedUntil=now+p.blockSeconds*1000;b.failures=0;} this.buckets.set(identity,b);
 }
 recordSuccess(identity:string):void{const b=this.buckets.get(identity);if(b)b.failures=0;}
}
export interface BehaviorSignal { readonly key:string; readonly score:number; readonly reason:string; }
export function scoreBehavior(input:{failureRate:number;distinctOrganizations:number;requestsPerMinute:number;capabilityDenials:number;replayAttempts:number}):BehaviorSignal{
 let score=0;
 if(input.failureRate>=0.5)score+=30;
 if(input.distinctOrganizations>=5)score+=25;
 if(input.requestsPerMinute>=120)score+=25;
 if(input.capabilityDenials>=10)score+=15;
 if(input.replayAttempts>=3)score+=20;
 return {key:score>=60?"HIGH":score>=30?"MEDIUM":"LOW",score,reason:"bounded behavioral risk signals"};
}
