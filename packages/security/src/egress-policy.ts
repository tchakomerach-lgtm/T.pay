import {isIP} from "node:net";

export interface EgressRequest { readonly url: string; readonly purpose: string; readonly organizationId: string; readonly dataClass: string; }
export interface EgressPolicy { readonly allowedHosts: readonly string[]; readonly allowedProtocols?: readonly string[]; readonly blockedHosts?: readonly string[]; }

function ipv4Octets(host:string):number[]|null {
  if(isIP(host)!==4)return null;
  const parts=host.split(".").map(Number);
  return parts.length===4 && parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)?parts:null;
}
function isPrivateTarget(host:string):boolean {
  const normalized=host.replace(/^\[|\]$/g,"").toLowerCase();
  const ipVersion=isIP(normalized);
  if(ipVersion===4){
    const o=ipv4Octets(normalized); if(!o)return true;
    const a=o[0]; const b=o[1];
    if(a===undefined || b===undefined) return true;
    return a===0 || a===10 || a===127 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) ||
      (a===192&&b===168) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19)) ||
      (a===192&&b===0) || a>=224;
  }
  if(ipVersion===6){
    return normalized==="::1" || normalized==="::" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") || normalized.startsWith("ff");
  }
  return normalized==="localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local");
}

export function assertEgressAllowed(request:EgressRequest, policy:EgressPolicy):void {
  if(!request.organizationId.trim() || !request.purpose.trim() || !request.dataClass.trim()) throw new Error("EGRESS_CONTEXT_REQUIRED");
  let u:URL; try{u=new URL(request.url)}catch{throw new Error("EGRESS_URL_INVALID")}
  const protocols=policy.allowedProtocols??["https:"];
  if(!protocols.includes(u.protocol)) throw new Error("EGRESS_PROTOCOL_DENIED");
  const host=u.hostname.toLowerCase().replace(/\.$/,"");
  if(isPrivateTarget(host)) throw new Error("EGRESS_PRIVATE_TARGET_DENIED");
  if((policy.blockedHosts??[]).some(h=>h.toLowerCase()===host)) throw new Error("EGRESS_HOST_BLOCKED");
  if(!policy.allowedHosts.some(h=>host===h.toLowerCase() || host.endsWith("."+h.toLowerCase()))) throw new Error("EGRESS_HOST_NOT_ALLOWED");
}
