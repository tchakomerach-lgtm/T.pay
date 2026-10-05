import {createHash} from "node:crypto";
import {assertHttpsOrigin} from "./auth-device.js";
import {authorizeRoute, type ApiRoutePolicy} from "./policy.js";
import {resolveRatePolicy, type ApiChannel} from "./rate-policy.js";
import {ApiAbuseRepository} from "./rate-abuse.js";
import {assertApiVersionCompatibility} from "./api-version.js";

export type RuntimeDecision=
  | {allowed:true;correlationId:string;policyKey:string;rateScopes:string[]}
  | {allowed:false;status:401|403|429|503;code:string;correlationId:string;retryAfterSeconds?:number};

const evidenceHash=(value:string)=>createHash("sha256").update(value).digest("hex");

export class ApiRuntimeGate {
  constructor(private readonly abuse:ApiAbuseRepository){}
  async evaluate(input:{
    method:string;
    route:string;
    authClass:ApiRoutePolicy["auth"];
    channel:ApiChannel;
    origin:string;
    correlationId:string;
    scopeSecrets:Partial<Record<"ip"|"device"|"actor"|"organization"|"phone"|"channel",string>>;
    organizationId?:string;
    now:string;
  }):Promise<RuntimeDecision>{
    assertHttpsOrigin(input.origin);
    try{
      assertApiVersionCompatibility(input.route);
    }catch(error){
      const code=error instanceof Error&&/^API_VERSION_/.test(error.message)?error.message:"API_VERSION_INVALID";
      return {allowed:false,status:code==="API_VERSION_MISSING"?400:code==="API_VERSION_SUNSET"?410:404,code,correlationId:input.correlationId};
    }
    const auth=authorizeRoute({method:input.method,route:input.route,authClass:input.authClass});
    if(!auth.allowed)return {allowed:false,status:auth.reason==="API_AUTH_INSUFFICIENT"?403:401,code:auth.reason,correlationId:input.correlationId};

    const rate=resolveRatePolicy({
      method:input.method,route:input.route,channel:input.channel,authClass:input.authClass
    });
    if(!rate)return {allowed:false,status:403,code:"API_RATE_POLICY_MISSING",correlationId:input.correlationId};

    for(const scope of rate.scopes){
      const secret=input.scopeSecrets[scope];
      if(!secret){
        if(scope==="device")continue;
        return {allowed:false,status:401,code:"API_SCOPE_EVIDENCE_MISSING",correlationId:input.correlationId};
      }
      try{
        const decision=await this.abuse.consume({
          policyKey:`${rate.policyKey}:${scope}`,
          scopeSecret:`${scope}:${secret}`,
          now:input.now,
          maxRequests:rate.maxRequests,
          windowSeconds:rate.windowSeconds
        });
        if(decision.limited){
          await this.abuse.recordAbuse({
            ...(input.organizationId===undefined?{}:{organizationId:input.organizationId}),
            route:input.route,
            scopeType:scope,
            scopeHash:decision.scopeHash,
            outcome:"limited",
            reason:"RATE_LIMIT_EXCEEDED",
            correlationId:input.correlationId,
            evidenceHash:evidenceHash(`${input.correlationId}\n${input.route}\n${scope}\n${decision.scopeHash}`),
            occurredAt:input.now
          });
          return {allowed:false,status:429,code:"API_RATE_LIMITED",correlationId:input.correlationId,retryAfterSeconds:decision.retryAfterSeconds};
        }
      }catch(error){
        await this.abuse.recordAbuse({
          ...(input.organizationId===undefined?{}:{organizationId:input.organizationId}),
          route:input.route,
          scopeType:scope,
          scopeHash:evidenceHash(`failure:${scope}:${input.correlationId}`),
          outcome:"blocked",
          reason:"RATE_CONTROL_UNAVAILABLE",
          correlationId:input.correlationId,
          evidenceHash:evidenceHash(`unavailable:${input.correlationId}:${scope}`),
          occurredAt:input.now
        }).catch(()=>undefined);
        return {allowed:false,status:503,code:"API_RATE_CONTROL_UNAVAILABLE",correlationId:input.correlationId};
      }
    }
    return {allowed:true,correlationId:input.correlationId,policyKey:rate.policyKey,rateScopes:[...rate.scopes]};
  }
}
