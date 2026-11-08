export type ApiRoutePolicy={route:string;methods:string[];auth:"anonymous"|"user"|"member"|"admin"|"service";financial:boolean};
export const API_ROUTE_POLICIES:readonly ApiRoutePolicy[]=[
 {route:"/v1/health",methods:["GET"],auth:"anonymous",financial:false},
 {route:"/v1/profile",methods:["GET","PATCH"],auth:"user",financial:false},
 {route:"/v1/organizations",methods:["GET","POST"],auth:"user",financial:false},
 {route:"/v1/organizations/:organizationId",methods:["GET","PATCH"],auth:"member",financial:false},
 {route:"/v1/ai/runs",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/payments/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/transfers/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/deposits/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/withdrawals/intents",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/loans/applications",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/tontines/contributions",methods:["POST"],auth:"member",financial:true},
 {route:"/v1/education/actors/:actorId",methods:["GET"],auth:"member",financial:false},
 {route:"/v1/education/classes",methods:["GET","POST"],auth:"member",financial:false},
 {route:"/v1/education/subjects",methods:["GET","POST"],auth:"member",financial:false},
 {route:"/v1/education/assessments",methods:["GET","POST"],auth:"member",financial:false},
 {route:"/v1/education/assessments/:assessmentId",methods:["PATCH"],auth:"member",financial:false},
 {route:"/v1/education/assessments/:assessmentId/grades",methods:["GET","POST"],auth:"member",financial:false},
 {route:"/v1/education/subjects/:subjectCode",methods:["PATCH"],auth:"member",financial:false},
 {route:"/v1/education/class-assignments",methods:["GET","POST"],auth:"member",financial:false},
 {route:"/v1/education/class-assignments/:assignmentId",methods:["PATCH"],auth:"member",financial:false},
 {route:"/v1/education/enrollments",methods:["GET","POST"],auth:"member",financial:false},
 {route:"/v1/education/enrollments/:enrollmentId",methods:["PATCH"],auth:"member",financial:false},
 {route:"/v1/education/sync/events",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/education/attendance",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/education/work-items",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/education/work-items/:workItemId/claim",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/education/work-items/:workItemId/resolve",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/education/service-requests",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/education/service-requests/:requestId/transition",methods:["POST"],auth:"member",financial:false},
 {route:"/v1/education/events/stream",methods:["GET"],auth:"member",financial:false},
];
const segments=(route:string)=>route.split("/").filter(Boolean);
const routeMatches=(pattern:string,actual:string):boolean=>{
 const p=segments(pattern), a=segments(actual);
 if(p.length!==a.length)return false;
 return p.every((part,index)=>part.startsWith(":")||part===a[index]);
};
export function resolveRoutePolicy(method:string,route:string):ApiRoutePolicy|null{
 const candidate=API_ROUTE_POLICIES.find(p=>routeMatches(p.route,route)&&p.methods.includes(method.toUpperCase()));
 return candidate??null;
}
export function isFinancialRoute(route:string):boolean{return /(^|\/)\b(payments?|wallets?|ledger|credit|loans?|transfers?|cash|withdrawals?|deposits?|tontines?)\b/i.test(route);}
export function authorizeRoute(input:{method:string;route:string;authClass:ApiRoutePolicy["auth"]}):{allowed:boolean;reason:string;policy?:ApiRoutePolicy}{
 const policy=resolveRoutePolicy(input.method,input.route);
 if(!policy){
  if(isFinancialRoute(input.route)) return {allowed:false,reason:"FINANCIAL_CORE_DENY_BY_DEFAULT"};
  return {allowed:false,reason:"API_ROUTE_NOT_ALLOWLISTED"};
 }
 const rank={anonymous:0,user:1,member:2,admin:3,service:4} as const;
 return rank[input.authClass]>=rank[policy.auth]?{allowed:true,reason:"ALLOWED",policy}:{allowed:false,reason:"API_AUTH_INSUFFICIENT",policy};
}
