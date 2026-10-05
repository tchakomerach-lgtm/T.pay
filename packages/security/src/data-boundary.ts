import {createHash} from "node:crypto";
export type DataClass="public"|"internal"|"confidential"|"restricted"|"secret";
export interface BoundaryPolicy{readonly allowed:readonly DataClass[];readonly maxBytes:number;readonly redactKeys?:readonly string[];}
const secretKey=/password|token|secret|authorization|cookie|private.?key|api.?key|mnemonic|seed/i;
export function classifyData(value:unknown):DataClass{
 const text=typeof value==="string"?value:JSON.stringify(value);
 if(!text)return"public";
 if(/BEGIN (RSA|EC|OPENSSH) PRIVATE KEY|sk-[A-Za-z0-9_-]{20,}/.test(text))return"secret";
 if(/\b\d{13,19}\b/.test(text))return"restricted";
 return"internal";
}
export function enforceOutputBoundary(value:unknown,policy:BoundaryPolicy):unknown{
 if(!Number.isSafeInteger(policy.maxBytes)||policy.maxBytes<1)throw new Error("AI_OUTPUT_POLICY_INVALID");
 const bytes=Buffer.byteLength(JSON.stringify(value)??"","utf8");
 if(bytes>policy.maxBytes)throw new Error("AI_OUTPUT_SIZE_EXCEEDED");
 const detected=classifyData(value);
 if(!policy.allowed.includes(detected))throw new Error("AI_OUTPUT_DATA_CLASS_DENIED");
 return redact(value,policy.redactKeys??[]);
}
function redact(value:unknown,extra:readonly string[]):unknown{
 if(Array.isArray(value))return value.map(v=>redact(v,extra));
 if(value&&typeof value==="object"){
  const out:Record<string,unknown>={};
  for(const [k,v] of Object.entries(value as Record<string,unknown>))out[k]=(secretKey.test(k)||extra.includes(k))?"[REDACTED]":redact(v,extra);
  return out;
 }
 return value;
}
export function outputDigest(value:unknown):string{return createHash("sha256").update(JSON.stringify(value)??"","utf8").digest("hex");}
