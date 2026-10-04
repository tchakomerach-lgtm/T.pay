import {createHash,createHmac,timingSafeEqual} from "node:crypto";
export interface MfiProviderCallback{organizationId:string;provider:string;providerEventId:string;providerReference:string;amountMinor:bigint;currency:string;occurredAt:string;status:"confirmed"|"failed";rawBody:string;signature:string;secret:string;}
export function verifyMfiCallback(c:MfiProviderCallback,maxAgeSeconds:number,now=Date.now()):void{
 const expected=createHmac("sha256",c.secret).update(c.rawBody,"utf8").digest("hex"),given=c.signature.replace(/^sha256=/,"").trim();
 const a=Buffer.from(expected),b=Buffer.from(given);if(a.length!==b.length||!timingSafeEqual(a,b))throw new Error("MFI_CALLBACK_SIGNATURE_INVALID");
 const t=Date.parse(c.occurredAt);if(!Number.isFinite(t)||Math.abs(now-t)>maxAgeSeconds*1000)throw new Error("MFI_CALLBACK_STALE");
 if(c.amountMinor<=0n||!/^[A-Z]{3}$/.test(c.currency))throw new Error("MFI_CALLBACK_MONEY_INVALID");
 if(!c.organizationId||!c.provider||!c.providerEventId||!c.providerReference)throw new Error("MFI_CALLBACK_IDENTITY_INVALID");
}
export function callbackBodyHash(raw:string):string{return createHash("sha256").update(raw,"utf8").digest("hex");}
