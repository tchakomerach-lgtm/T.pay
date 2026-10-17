export type ApiRoutePolicy={route:string;methods:string[];auth:"anonymous"|"user"|"member"|"admin"|"service";financial:boolean};
export const API_ROUTE_POLICIES:readonly ApiRoutePolicy[]=[
 {route:"/v1/auth/register",methods:["POST"],auth:"anonymous",financial:false},
 {route:"/v1/auth/login",methods:["POST"],auth:"anonymous",financial:false},
 {route:"/v1/auth/me",methods:["GET"],auth:"user",financial:false},
 {route:"/v1/auth/logout",methods:["POST"],auth:"user",financial:false},
 {route:"/v1/health",methods:["GET"],auth:"anonymous",financial:false},
 {route:"/v1/profile",methods:["GET","PATCH"],auth:"user",financial:false},
 {route:"/v1/organizations",methods:["GET","POST"],auth:"user",financial:false},
 {route:"/v1/organizations/:organizationId",methods:["GET","PATCH"],auth:"member",financial:false},
 {route:"/v1/organizations/:organizationId/audit",methods:["GET"],auth:"member",financial:false},
 {route:"/v1/organizations/:organizationId/invitations",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/organizations/:organizationId/invitations/:invitationId/accept",methods:["POST"],auth:"user",financial:false},
 {route:"/v1/organizations/:organizationId/portal-codes",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/organizations/:organizationId/portal-session",methods:["POST"],auth:"user",financial:false},
 {route:"/v1/organizations/:organizationId/session",methods:["POST"],auth:"user",financial:false},
 {route:"/v1/organizations/:organizationId/members",methods:["GET"],auth:"member",financial:false},
 {route:"/v1/organizations/:organizationId/roles",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/organizations/:organizationId/roles/:roleId",methods:["PATCH"],auth:"member",financial:false},
 {route:"/v1/organizations/:organizationId/members/:userId",methods:["PATCH"],auth:"member",financial:false},
 {route:"/v1/client/telemetry",methods:["POST"],auth:"user",financial:false},
 {route:"/v1/admin/auth/webauthn/challenge",methods:["POST"],auth:"user",financial:false},
 {route:"/v1/admin/auth/webauthn/step-up",methods:["POST"],auth:"user",financial:false},
 {route:"/v1/admin/overview",methods:["GET"],auth:"admin",financial:false},
 {route:"/v1/admin/security-posture",methods:["GET"],auth:"admin",financial:false},
 {route:"/v1/admin/runtime",methods:["GET"],auth:"admin",financial:false},
 {route:"/v1/admin/runtime/change-requests",methods:["GET","POST"],auth:"admin",financial:false},
 {route:"/v1/admin/runtime/change-requests/:requestId/approve",methods:["POST"],auth:"admin",financial:false},
 {route:"/v1/admin/audit",methods:["GET"],auth:"admin",financial:false},
 {route:"/v1/ai/runs",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/payments/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/transfers/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/deposits/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/withdrawals/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/loans/applications",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/tontines/contributions",methods:["POST"],auth:"member",financial:true},
];
const normalize=(route:string)=>route.split("/").filter(Boolean).map(s=>s.startsWith(":")?":param":s).join("/");
const normalizedPolicyRoute=(route:string)=>"/"+normalize(route);
export function resolveRoutePolicy(method:string,route:string):ApiRoutePolicy|null{
 const normalized="/"+normalize(route);
 const candidate=API_ROUTE_POLICIES.find(p=>normalizedPolicyRoute(p.route)===normalized&&p.methods.includes(method.toUpperCase()));
 return candidate??null;
}
export function isFinancialRoute(route:string):boolean{return /(^|\/)\b(payments?|wallets?|ledger|credit|loans?|transfers?|cash|withdrawals?|deposits?|tontines?)\b/i.test(route);}
export function authorizeRoute(input:{method:string;route:string;authClass:ApiRoutePolicy["auth"]}):{allowed:boolean;reason:string;policy?:ApiRoutePolicy}{
 const policy=resolveRoutePolicy(input.method,input.route);
 if(!policy){if(isFinancialRoute(input.route))return {allowed:false,reason:"FINANCIAL_CORE_DENY_BY_DEFAULT"};return {allowed:false,reason:"API_ROUTE_NOT_ALLOWLISTED"};}
 const rank={anonymous:0,user:1,member:2,admin:3,service:4} as const;
 return rank[input.authClass]>=rank[policy.auth]?{allowed:true,reason:"ALLOWED",policy}:{allowed:false,reason:"API_AUTH_INSUFFICIENT",policy};
}
