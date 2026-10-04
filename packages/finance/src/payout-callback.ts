import { createHmac, timingSafeEqual } from "node:crypto";

export type PayoutCallbackState = "accepted"|"duplicate"|"rejected"|"quarantined";
export interface PayoutCallbackPayload { organizationId:string;payoutId:string;provider:string;providerEventId:string;providerReference:string;amountMinor:bigint;currency:string;status:"confirmed"|"failed";occurredAt:string; }
export interface PayoutCallbackEnvelope { rawBody:string;signature:string;receivedAt:string;maxAgeSeconds:number;secret:string; }

export function verifyPayoutCallbackSignature(e:PayoutCallbackEnvelope):boolean{
 const expected=createHmac("sha256",e.secret).update(e.rawBody,"utf8").digest("hex");
 const provided=e.signature.replace(/^sha256=/,"").trim();
 const a=Buffer.from(expected,"utf8"), b=Buffer.from(provided,"utf8");
 return a.length===b.length&&timingSafeEqual(a,b);
}
export function isPayoutCallbackFresh(receivedAt:string,occurredAt:string,maxAgeSeconds:number,now=Date.now()):boolean{
 if(!Number.isInteger(maxAgeSeconds)||maxAgeSeconds<=0)throw new Error("PAYOUT_CALLBACK_MAX_AGE_INVALID");
 const received=Date.parse(receivedAt),occurred=Date.parse(occurredAt);
 if(!Number.isFinite(received)||!Number.isFinite(occurred))return false;
 return Math.abs(now-occurred)<=maxAgeSeconds*1000&&Math.abs(now-received)<=maxAgeSeconds*1000;
}
export function parsePayoutCallback(rawBody:string):PayoutCallbackPayload{
 const value:unknown=JSON.parse(rawBody); if(!value||typeof value!=="object")throw new Error("PAYOUT_CALLBACK_PAYLOAD_INVALID");
 const v=value as Record<string,unknown>;
 for(const k of ["organizationId","payoutId","provider","providerEventId","providerReference","amountMinor","currency","status","occurredAt"])if(typeof v[k]!=="string"||!v[k])throw new Error("PAYOUT_CALLBACK_FIELD_INVALID");
 if(!/^[0-9]+$/.test(v.amountMinor as string))throw new Error("PAYOUT_CALLBACK_AMOUNT_INVALID");
 if(!/^[A-Z]{3}$/.test(v.currency as string))throw new Error("PAYOUT_CALLBACK_CURRENCY_INVALID");
 if(v.status!=="confirmed"&&v.status!=="failed")throw new Error("PAYOUT_CALLBACK_STATUS_INVALID");
 return {...v,amountMinor:BigInt(v.amountMinor as string)} as PayoutCallbackPayload;
}
export function classifyPayoutCallback(e:{organizationId:string;payoutId:string;provider:string;amountMinor:bigint;currency:string;providerReference:string},a:PayoutCallbackPayload):PayoutCallbackState{
 if(a.organizationId!==e.organizationId||a.payoutId!==e.payoutId||a.provider!==e.provider||a.providerReference!==e.providerReference||a.amountMinor!==e.amountMinor||a.currency!==e.currency)return "quarantined";
 return "accepted";
}
