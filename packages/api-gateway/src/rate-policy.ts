import {resolveRoutePolicy} from "./policy.js";
import type {RateScope} from "./rate-abuse.js";

export type ApiChannel="web"|"mobile"|"agent"|"ussd"|"sms"|"voice"|"partner";
export interface RatePolicy {
  policyKey:string;
  scopes:readonly RateScope[];
  windowSeconds:number;
  maxRequests:number;
}

const CHANNEL_DEFAULTS:Record<ApiChannel,{windowSeconds:number;maxRequests:number}> = {
  web:{windowSeconds:60,maxRequests:60},
  mobile:{windowSeconds:60,maxRequests:90},
  agent:{windowSeconds:60,maxRequests:45},
  ussd:{windowSeconds:60,maxRequests:12},
  sms:{windowSeconds:60,maxRequests:8},
  voice:{windowSeconds:60,maxRequests:10},
  partner:{windowSeconds:60,maxRequests:30}
};

export function resolveRatePolicy(input:{
  method:string;
  route:string;
  channel:ApiChannel;
  authClass:"anonymous"|"user"|"member"|"admin"|"service";
}):RatePolicy|null {
  const routePolicy=resolveRoutePolicy(input.method,input.route);
  if(!routePolicy) return null;
  const base=CHANNEL_DEFAULTS[input.channel];
  const scopes:RateScope[]=["channel","ip"];
  if(input.authClass!=="anonymous") scopes.push("actor","device");
  if(routePolicy.route.includes("/organizations")) scopes.push("organization");
  if(input.channel==="ussd"||input.channel==="sms") scopes.push("phone");
  const riskMultiplier=input.authClass==="service"?2:input.authClass==="admin"?1.5:1;
  return {
    policyKey:`${input.channel}:${input.method.toUpperCase()}:${routePolicy.route}`,
    scopes:[...new Set(scopes)],
    windowSeconds:base.windowSeconds,
    maxRequests:Math.max(1,Math.floor(base.maxRequests*riskMultiplier))
  };
}
