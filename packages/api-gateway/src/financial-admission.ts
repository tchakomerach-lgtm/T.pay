import {createHash} from "node:crypto";

export interface FinancialIntentAdmissionInput{
  method:string;
  route:string;
  organizationId?:string;
  idempotencyKey?:string;
  payloadHash?:string;
  authClass:"anonymous"|"user"|"member"|"admin"|"service";
  humanApprovalRequired?:boolean;
}

export interface FinancialIntentAdmission{
  routeClass:"payment_intent"|"transfer_intent"|"deposit_intent"|"withdrawal_intent"|"loan_application"|"tontine_contribution";
  requiresFinancialCore:true;
  requiresHumanApproval:boolean;
  organizationId:string;
  idempotencyKey:string;
  payloadHash:string;
  evidenceHash:string;
}

const ROUTES:readonly [string,FinancialIntentAdmission["routeClass"]][]=[
 ["/v1/payments/intents","payment_intent"],
 ["/v1/transfers/intents","transfer_intent"],
 ["/v1/deposits/intents","deposit_intent"],
 ["/v1/withdrawals/intents","withdrawal_intent"],
 ["/v1/loans/applications","loan_application"],
 ["/v1/tontines/contributions","tontine_contribution"]
];

const HASH64=/^[a-f0-9]{64}$/;

function normalizedRoute(route:string):string{
 return route.split("/").filter(Boolean).map(part=>part.startsWith(":")?":param":part).join("/");
}

export function resolveFinancialIntentRoute(method:string,route:string):FinancialIntentAdmission["routeClass"]|null{
 if(method.toUpperCase()!=="POST")return null;
 const normalized="/"+normalizedRoute(route);
 return ROUTES.find(([candidate])=>candidate===normalized)?.[1]??null;
}

export function admitFinancialIntent(input:FinancialIntentAdmissionInput):FinancialIntentAdmission{
 const routeClass=resolveFinancialIntentRoute(input.method,input.route);
 if(!routeClass)throw new Error("FINANCIAL_INTENT_ROUTE_NOT_ALLOWED");
 if(input.authClass!=="member"&&input.authClass!=="admin"&&input.authClass!=="service"){
  throw new Error("FINANCIAL_INTENT_AUTH_REQUIRED");
 }
 if(!input.organizationId)throw new Error("FINANCIAL_INTENT_ORGANIZATION_REQUIRED");
 const key=input.idempotencyKey?.trim();
 if(!key||key.length<8||key.length>200)throw new Error("FINANCIAL_INTENT_IDEMPOTENCY_REQUIRED");
 const payloadHash=input.payloadHash?.toLowerCase();
 if(!payloadHash||!HASH64.test(payloadHash))throw new Error("FINANCIAL_INTENT_PAYLOAD_HASH_REQUIRED");
 const requiresHumanApproval=input.humanApprovalRequired!==false;
 const evidenceHash=createHash("sha256")
  .update([routeClass,input.organizationId,key,payloadHash,requiresHumanApproval?"human":"policy"].join("\n"))
  .digest("hex");
 return {routeClass,requiresFinancialCore:true,requiresHumanApproval,organizationId:input.organizationId,
  idempotencyKey:key,payloadHash,evidenceHash};
}
