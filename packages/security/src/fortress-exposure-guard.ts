import {createHash} from "node:crypto";

export type ExposureChannel="log"|"error"|"telemetry"|"export"|"ai-context"|"notification";
export type Sensitivity="public"|"internal"|"confidential"|"restricted"|"secret";
export interface ExposureContext {
 readonly channel:ExposureChannel;
 /** Must be populated from trusted server-side auth context, never from request body. */
 readonly actorId?:string;
 readonly organizationId?:string;
 readonly purpose:string;
 readonly allowedClasses:readonly Sensitivity[];
 readonly maxBytes:number;
}
export interface SanitizedExposure {
 readonly value:unknown;
 readonly digest:string;
 readonly originalBytes:number;
 readonly outputBytes:number;
 readonly redactedPaths:readonly string[];
 readonly classification:Sensitivity;
}
const KEY_DENY=/(password|passwd|token|secret|authorization|cookie|private.?key|api.?key|mnemonic|seed phrase|access.?key|refresh.?token|session.?id|otp|pin|cvv|pan|account.?number|national.?id|passport|phone|email|address|date.?of.?birth|biometric|medical|kyc.?document)/i;
const PEM=/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
const BEARER=/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const JWT=/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const EMAIL=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE=/(?<!\w)(?:\+?\d[\d ()-]{7,}\d)(?!\w)/g;
const LONG_CARD=/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g;
const SECRET_ASSIGN=/(\b(?:password|token|secret|api[_-]?key|client[_-]?secret)\s*[:=]\s*)[^\s,;]+/gi;
const PASSPORT_LIKE=/\b[A-Z]{1,2}\d{6,10}\b/g;
const API_TOKEN=/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b/g;
const TOGO_LOCAL_PHONE=/(?<!\d)(?:2[2-8](?:[ -]?\d){6}|[79](?:[ -]?\d){7})(?!\d)/g;

function safeJson(v:unknown):string {
 try { return JSON.stringify(v)??"null"; } catch { throw new Error("FORTRESS_EXPOSURE_SERIALIZATION_DENIED"); }
}
function bytes(v:unknown):number { return Buffer.byteLength(safeJson(v),"utf8"); }
function digest(v:unknown):string { return createHash("sha256").update(safeJson(v),"utf8").digest("hex"); }
function maskString(input:string):{value:string;changed:boolean}{
 let value=input;
 value=value.replace(PEM,"[REDACTED_PRIVATE_KEY]").replace(BEARER,"Bearer [REDACTED]").replace(JWT,"[REDACTED_JWT]").replace(SECRET_ASSIGN,"$1[REDACTED]").replace(API_TOKEN,"[REDACTED_API_TOKEN]").replace(EMAIL,"[REDACTED_EMAIL]").replace(LONG_CARD,"[REDACTED_PAYMENT_IDENTIFIER]").replace(PASSPORT_LIKE,"[REDACTED_ID]").replace(PHONE,"[REDACTED_PHONE]").replace(TOGO_LOCAL_PHONE,"[REDACTED_PHONE]");
 return {value,changed:value!==input};
}
function scrub(value:unknown,path:string,paths:string[]):unknown {
 if(typeof value==="string"){const r=maskString(value);if(r.changed)paths.push(path||"$");return r.value;}
 if(Array.isArray(value))return value.map((v,i)=>scrub(v,`${path}[${i}]`,paths));
 if(value&&typeof value==="object"){
  const out:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
   const p=path?`${path}.${key}`:key;
   if(KEY_DENY.test(key)){out[key]="[REDACTED]";paths.push(p);}
   else out[key]=scrub(item,p,paths);
  }
  return out;
 }
 if(typeof value==="bigint")return value.toString();
 if(typeof value==="function"||typeof value==="symbol")return "[OMITTED]";
 return value;
}
export function classifyExposure(value:unknown):Sensitivity {
 const s=safeJson(value);
 if(/PRIVATE KEY|\bBearer\s+(?!\[REDACTED\])\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./i.test(s))return "secret";
 if(/\b\d{13,19}\b|\b[A-Z]{1,2}\d{6,10}\b/i.test(s))return "restricted";
 if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\+?\d[\d ()-]{7,}\d/i.test(s))return "confidential";
 return "internal";
}
/** Scrub data before it leaves a Fortress trust boundary. This is defense-in-depth, not a substitute for authorization. */
export function sanitizeForExposure(input:unknown,context:ExposureContext):SanitizedExposure {
 if(typeof context.purpose!=="string"||!context.purpose.trim())throw new Error("FORTRESS_EXPOSURE_PURPOSE_REQUIRED");
 if(!Number.isSafeInteger(context.maxBytes)||context.maxBytes<1)throw new Error("FORTRESS_EXPOSURE_LIMIT_INVALID");
 if(!Array.isArray(context.allowedClasses)||context.allowedClasses.length===0)throw new Error("FORTRESS_EXPOSURE_CLASSES_REQUIRED");
 if(context.channel==="export"&&(!context.actorId?.trim()||!context.organizationId?.trim()))throw new Error("FORTRESS_EXPOSURE_ACTOR_REQUIRED");
 const originalBytes=bytes(input);
 const redactedPaths:string[]=[];
 const value=scrub(input,"",redactedPaths);
 const classification=classifyExposure(value);
 if(!context.allowedClasses.includes(classification))throw new Error("FORTRESS_EXPOSURE_CLASS_DENIED");
 const outputBytes=bytes(value);
 if(outputBytes>context.maxBytes)throw new Error("FORTRESS_EXPOSURE_SIZE_LIMIT");
 return {value,digest:digest(value),originalBytes,outputBytes,redactedPaths,classification};
}
/** Errors shown to clients must not leak stack traces, SQL, paths, provider responses or internal identifiers. */
export function safeClientError(code:string,correlationId:string):Readonly<{error:"REQUEST_FAILED";code:string;correlationId:string}>{
 const safeCode=/^[A-Z0-9_]{2,64}$/.test(code)?code:"INTERNAL_ERROR";
 const correlationCandidate=/^[A-Za-z0-9._:-]{8,128}$/.test(correlationId)?correlationId:"";
 const safeCorrelation=correlationCandidate&&!maskString(correlationCandidate).changed?correlationCandidate:"unavailable";
 return Object.freeze({error:"REQUEST_FAILED",code:safeCode,correlationId:safeCorrelation});
}
/** Prevents high-risk content from entering logs by accepting only an allowlisted event envelope. */
export function safeSecurityTelemetry(input:{eventType:string;severity:"info"|"warn"|"high"|"critical";organizationId?:string;actorId?:string;correlationId:string;metadata?:Record<string,unknown>}){
 const eventType=/^[a-z0-9_.:-]{1,100}$/i.test(input.eventType)?input.eventType:"security.event.invalid";
 const severity=(["info","warn","high","critical"] as const).includes(input.severity)?input.severity:"warn";
 const safeId=(v:string|undefined)=>v&&/^[A-Za-z0-9_-]{1,96}$/.test(v)?v:undefined;
 const correlationId=safeId(input.correlationId)??"unavailable";
 const metadata=sanitizeForExposure(input.metadata??{},{channel:"telemetry",purpose:"security-monitoring",allowedClasses:["public","internal"],maxBytes:4096});
 return Object.freeze({eventType,severity,organizationId:safeId(input.organizationId),actorId:safeId(input.actorId),correlationId,metadata:metadata.value,metadataDigest:metadata.digest,redactedFields:metadata.redactedPaths.length});
}
