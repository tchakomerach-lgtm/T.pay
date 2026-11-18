import type {PoolClient} from "pg";
export interface RateLimitDecision {allowed:boolean;count:number;windowStartedAt:string;retryAfterSeconds:number;}
export class PostgresSecurityRateLimiter {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async consume(scopeKey:string,now:string,windowSeconds:number,maxRequests:number):Promise<RateLimitDecision>{
    if(!/^[a-f0-9]{64}$/.test(scopeKey)) throw new Error("SECURITY_SCOPE_KEY_INVALID");
    if(windowSeconds<1||windowSeconds>3600||maxRequests<1) throw new Error("SECURITY_RATE_POLICY_INVALID");
    const r=await this.db.query(
      `WITH current_window AS (
         SELECT to_timestamp(floor(extract(epoch from $2::timestamptz)/$3)*$3) AS started
       )
       INSERT INTO security_rate_limits(scope_key,window_started_at,request_count)
       SELECT $1,started,1 FROM current_window
       ON CONFLICT(scope_key,window_started_at) DO UPDATE SET request_count=security_rate_limits.request_count+1
       RETURNING window_started_at,request_count`,
      [scopeKey,now,windowSeconds]
    );
    const row=r.rows[0]; const count=Number(row.request_count);
    return {allowed:count<=maxRequests,count,windowStartedAt:new Date(row.window_started_at).toISOString(),retryAfterSeconds:windowSeconds-(Math.floor(Date.parse(now)/1000)%windowSeconds)};
  }
}
