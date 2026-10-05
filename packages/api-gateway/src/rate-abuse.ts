import {createHash,randomUUID} from "node:crypto";
export type RateScope="ip"|"device"|"actor"|"organization"|"phone"|"channel";
export type RateOutcome="allowed"|"limited"|"blocked";
export interface RateDb{query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}>;}
const HEX64=/^[a-f0-9]{64}$/;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export function rateScopeHash(secret:string):string{if(secret.length<1||secret.length>512)throw new Error("RATE_SCOPE_INVALID");return hash(secret);}
export function fixedWindowStart(now:string,windowSeconds:number):string{
 if(!Number.isInteger(windowSeconds)||windowSeconds<1||windowSeconds>86400)throw new Error("RATE_WINDOW_INVALID");
 const ms=Date.parse(now);if(!Number.isFinite(ms))throw new Error("RATE_TIME_INVALID");
 return new Date(Math.floor(ms/(windowSeconds*1000))*windowSeconds*1000).toISOString();
}
export interface RateDecision{allowed:boolean;limited:boolean;requestCount:number;limit:number;retryAfterSeconds:number;scopeHash:string;}
export class ApiAbuseRepository{
 constructor(private readonly db:RateDb){}
 async consume(input:{policyKey:string;scopeSecret:string;now:string;maxRequests:number;windowSeconds:number}):Promise<RateDecision>{
  if(!input.policyKey||input.policyKey.length>160)throw new Error("RATE_POLICY_INVALID");
  if(!Number.isInteger(input.maxRequests)||input.maxRequests<1)throw new Error("RATE_LIMIT_INVALID");
  const scopeHash=rateScopeHash(input.scopeSecret);
  const windowStart=fixedWindowStart(input.now,input.windowSeconds);
  const r=await this.db.query(`INSERT INTO api_rate_limit_buckets(policy_key,scope_hash,window_started_at,request_count,max_requests,window_seconds,updated_at)
VALUES($1,$2,$3::timestamptz,1,$4,$5,$6::timestamptz)
ON CONFLICT(policy_key,scope_hash) DO UPDATE SET
 request_count=CASE WHEN api_rate_limit_buckets.window_started_at < EXCLUDED.window_started_at THEN 1 ELSE api_rate_limit_buckets.request_count+1 END,
 window_started_at=CASE WHEN api_rate_limit_buckets.window_started_at < EXCLUDED.window_started_at THEN EXCLUDED.window_started_at ELSE api_rate_limit_buckets.window_started_at END,
 max_requests=EXCLUDED.max_requests,
 window_seconds=EXCLUDED.window_seconds,
 updated_at=EXCLUDED.updated_at
RETURNING request_count,max_requests,window_started_at,window_seconds`,[input.policyKey,scopeHash,windowStart,input.maxRequests,input.windowSeconds,input.now]);
  const row=r.rows[0];if(!row)throw new Error("RATE_DECISION_UNAVAILABLE");
  const count=Number(row.request_count),limit=Number(row.max_requests),seconds=Number(row.window_seconds);
  const windowEnd=Date.parse(String(row.window_started_at))+seconds*1000;
  const retry=Math.max(1,Math.ceil((windowEnd-Date.parse(input.now))/1000));
  return {allowed:count<=limit,limited:count>limit,requestCount:count,limit,retryAfterSeconds:retry,scopeHash};
 }
 async recordAbuse(input:{organizationId?:string;route:string;scopeType:RateScope;scopeHash:string;outcome:RateOutcome;reason:string;correlationId:string;evidenceHash:string;occurredAt:string}):Promise<void>{
  if(!HEX64.test(input.scopeHash)||!HEX64.test(input.evidenceHash))throw new Error("ABUSE_EVIDENCE_INVALID");
  if(input.reason.length<1||input.reason.length>240)throw new Error("ABUSE_REASON_INVALID");
  await this.db.query("INSERT INTO api_abuse_events(id,organization_id,route,scope_type,scope_hash,outcome,reason,correlation_id,occurred_at,evidence_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10)",[randomUUID(),input.organizationId??null,input.route,input.scopeType,input.scopeHash,input.outcome,input.reason,input.correlationId,input.occurredAt,input.evidenceHash]);
 }
}
