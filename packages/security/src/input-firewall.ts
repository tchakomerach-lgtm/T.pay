const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CRLF = /[\r\n]/;
const PATH_TRAVERSAL = /(^|[\/\\])\.\.([\/\\]|$)/;
const SHELL_META = /[;&|$<>\n\r]/;
const PROTO_KEYS = new Set(["__proto__","prototype","constructor"]);
export interface InputLimits { readonly maxStringLength:number; readonly maxDepth:number; readonly maxKeys:number; readonly maxArrayLength:number; }
const DEFAULTS:InputLimits={maxStringLength:10000,maxDepth:12,maxKeys:1000,maxArrayLength:1000};
export function assertSafeText(value:string,limits:InputLimits=DEFAULTS):string {
 if(value.length>limits.maxStringLength) throw new Error("INPUT_TOO_LARGE");
 if(CONTROL.test(value)) throw new Error("INPUT_CONTROL_CHARACTER");
 return value;
}
export function assertSafeHeaderValue(value:string):string {
 if(CRLF.test(value)) throw new Error("INPUT_HEADER_INJECTION");
 return assertSafeText(value,{...DEFAULTS,maxStringLength:8000});
}
export function assertSafePathSegment(value:string):string {
 assertSafeText(value);
 if(PATH_TRAVERSAL.test(value)||value.includes("\0")) throw new Error("INPUT_PATH_TRAVERSAL");
 return value;
}
export function assertSafeShellArgument(value:string):string {
 assertSafeText(value);
 if(SHELL_META.test(value)) throw new Error("INPUT_SHELL_INJECTION");
 return value;
}
export function assertSafeIdentifier(value:string):string {
 if(!/^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(value)) throw new Error("INPUT_IDENTIFIER_INVALID");
 return value;
}
export function assertSafeJsonValue(value:unknown,limits:InputLimits=DEFAULTS):void {
 const seen=new WeakSet<object>(); let keys=0;
 const walk=(v:unknown,depth:number):void=>{
  if(depth>limits.maxDepth) throw new Error("INPUT_JSON_DEPTH_EXCEEDED");
  if(typeof v==="string"){assertSafeText(v,limits);return;}
  if(v===null||typeof v==="number"||typeof v==="boolean") return;
  if(typeof v!=="object") throw new Error("INPUT_JSON_TYPE_FORBIDDEN");
  if(seen.has(v as object)) throw new Error("INPUT_JSON_CYCLE");
  seen.add(v as object);
  if(Array.isArray(v)){if(v.length>limits.maxArrayLength) throw new Error("INPUT_JSON_ARRAY_TOO_LARGE"); for(const x of v) walk(x,depth+1);}
  else for(const [k,x] of Object.entries(v as Record<string,unknown>)){if(++keys>limits.maxKeys) throw new Error("INPUT_JSON_KEYS_EXCEEDED"); if(PROTO_KEYS.has(k)) throw new Error("INPUT_PROTO_POLLUTION_KEY"); walk(x,depth+1);}
  seen.delete(v as object);
 };
 walk(value,0);
}
export function sanitizeForLog(value:string,max=500):string{return value.replace(/[\r\n\t]/g," ").replace(/[\u0000-\u001F\u007F]/g,"").slice(0,max);}
export function detectPromptInjectionSignals(text:string):readonly string[]{
 const lower=text.toLowerCase(),s:string[]=[];
 if(/(ignore|disregard|override)\s+(all|previous|prior)\s+(instructions|rules|policies)/i.test(lower))s.push("OVERRIDE_INSTRUCTION");
 if(/(system|developer)\s+prompt.*(reveal|show|print|dump)/i.test(lower))s.push("PROMPT_EXFILTRATION");
 if(/(disable|bypass|turn off)\s+(security|auth|policy|approval|guardrail)/i.test(lower))s.push("SECURITY_BYPASS");
 if(/(execute|run)\s+(shell|command|powershell|bash|curl|wget)/i.test(lower))s.push("COMMAND_EXECUTION_REQUEST");
 return s;
}
