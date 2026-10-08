import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

function unsafeIp(ip:string):boolean {
 const v=isIP(ip); if(v===4){const p=ip.split(".").map(Number);const [a,b]=p;return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0)||(a>=224);}
 if(v===6){const h=ip.toLowerCase(); if(h.startsWith("::ffff:")) return unsafeIp(h.slice(7)); return h==="::1"||h==="::"||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("fe8")||h.startsWith("fe9")||h.startsWith("fea")||h.startsWith("feb")||h.startsWith("ff");}
 return true;
}
export async function resolvePublicDestination(hostname:string):Promise<readonly string[]>{
 if(!hostname||isIP(hostname)) { if(unsafeIp(hostname)) throw new Error("SSRF_UNSAFE_IP"); return [hostname]; }
 const normalized=hostname.toLowerCase();
 if(normalized==="localhost"||normalized.endsWith(".localhost")||normalized==="metadata.google.internal") throw new Error("SSRF_BLOCKED_HOST");
 const answers=await lookup(normalized,{all:true,verbatim:true});
 const addresses=[...new Set(answers.map(x=>x.address))];
 if(!addresses.length||addresses.some(unsafeIp)) throw new Error("SSRF_UNSAFE_RESOLUTION");
 return addresses;
}
/**
 * The caller must use the returned address for the actual socket connection and
 * preserve the original hostname for Host/SNI. A second unconstrained DNS lookup
 * is forbidden because it reopens DNS rebinding.
 */
export function assertPinnedDestination(hostname:string,address:string):void{
 if(!hostname||!address||unsafeIp(address)) throw new Error("SSRF_PIN_INVALID");
 if(isIP(hostname)&&hostname!==address) throw new Error("SSRF_PIN_MISMATCH");
}
export function assertNoRequestSmuggling(headers:Record<string,string|string[]|undefined>):void{
 const cl=headers["content-length"]??headers["Content-Length"];
 const te=headers["transfer-encoding"]??headers["Transfer-Encoding"];
 const cls=Array.isArray(cl)?cl:[cl].filter((x):x is string=>typeof x==="string");
 if(cls.length>1||cls.some(x=>!/^[0-9]+$/.test(x.trim()))) throw new Error("HTTP_AMBIGUOUS_CONTENT_LENGTH");
 if(te!==undefined && cl!==undefined) throw new Error("HTTP_CL_TE_CONFLICT");
 const tes=Array.isArray(te)?te:[te].filter((x):x is string=>typeof x==="string");
 if(tes.some(x=>x.toLowerCase().split(",").map(s=>s.trim()).some(v=>v!=="chunked"))) throw new Error("HTTP_TRANSFER_ENCODING_FORBIDDEN");
}
