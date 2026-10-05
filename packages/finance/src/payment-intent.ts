import {randomUUID} from "node:crypto";

export type PaymentIntentState="pending_approval"|"approved"|"rejected"|"settled"|"failed";
export interface PaymentIntent{
 id:string; organizationId:string; idempotencyKey:string; payloadHash:string;
 payerAccountId:string; payeeAccountId:string; amountMinor:bigint; currency:string;
 state:PaymentIntentState; requiresHumanApproval:boolean; approvedBy?:string; approvedAt?:string;
 createdAt:string; updatedAt:string;
}
export interface PaymentIntentRepository{
 findByIdempotency(organizationId:string,key:string):Promise<PaymentIntent|undefined>;
 insert(intent:PaymentIntent):Promise<PaymentIntent>;
 approve(organizationId:string,id:string,approvedBy:string,approvedAt:string):Promise<PaymentIntent|undefined>;
 reject(organizationId:string,id:string):Promise<PaymentIntent|undefined>;
}
const HASH64=/^[a-f0-9]{64}$/;
export function createPaymentIntent(input:{
 organizationId:string;idempotencyKey:string;payloadHash:string;payerAccountId:string;payeeAccountId:string;
 amountMinor:bigint;currency:string;requiresHumanApproval?:boolean;now:string;
}):PaymentIntent{
 if(!input.organizationId)throw new Error("PAYMENT_INTENT_ORGANIZATION_REQUIRED");
 if(input.idempotencyKey.length<8||input.idempotencyKey.length>200)throw new Error("PAYMENT_INTENT_IDEMPOTENCY_INVALID");
 if(!HASH64.test(input.payloadHash))throw new Error("PAYMENT_INTENT_PAYLOAD_HASH_INVALID");
 if(input.payerAccountId===input.payeeAccountId)throw new Error("SAME_PAYMENT_ACCOUNT");
 if(input.amountMinor<=0n)throw new Error("PAYMENT_AMOUNT_MUST_BE_POSITIVE");
 if(input.currency!=="XOF")throw new Error("PAYMENT_CURRENCY_UNSUPPORTED");
 return {id:randomUUID(),organizationId:input.organizationId,idempotencyKey:input.idempotencyKey,payloadHash:input.payloadHash,
  payerAccountId:input.payerAccountId,payeeAccountId:input.payeeAccountId,amountMinor:input.amountMinor,currency:input.currency,
  state:"pending_approval",requiresHumanApproval:input.requiresHumanApproval!==false,createdAt:input.now,updatedAt:input.now};
}
export async function submitPaymentIntent(repo:PaymentIntentRepository,input:Parameters<typeof createPaymentIntent>[0]):Promise<{intent:PaymentIntent;replayed:boolean}>{
 const existing=await repo.findByIdempotency(input.organizationId,input.idempotencyKey);
 if(existing){
  if(existing.payloadHash!==input.payloadHash)throw new Error("PAYMENT_INTENT_IDEMPOTENCY_CONFLICT");
  return {intent:existing,replayed:true};
 }
 return {intent:await repo.insert(createPaymentIntent(input)),replayed:false};
}
export async function approvePaymentIntent(repo:PaymentIntentRepository,organizationId:string,id:string,approvedBy:string,approvedAt:string):Promise<PaymentIntent>{
 if(!approvedBy)throw new Error("PAYMENT_INTENT_APPROVER_REQUIRED");
 const updated=await repo.approve(organizationId,id,approvedBy,approvedAt);
 if(!updated)throw new Error("PAYMENT_INTENT_NOT_APPROVABLE");
 return updated;
}
