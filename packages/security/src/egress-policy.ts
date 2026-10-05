export interface EgressRequest { readonly url: string; readonly purpose: string; readonly organizationId: string; readonly dataClass: string; }
export interface EgressPolicy { readonly allowedHosts: readonly string[]; readonly allowedProtocols?: readonly string[]; readonly blockedHosts?: readonly string[]; }
const privateHost=/^(localhost|127(?:\\.\\d{1,3}){3}|0\\.0\\.0\\.0|169\\.254\\.169\\.254|::1|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|10(?:\\.\\d{1,3}){3}|192\\.168(?:\\.\\d{1,3}){2}|172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})$/i;
export function assertEgressAllowed(request:EgressRequest, policy:EgressPolicy):void {
  if(!request.organizationId.trim() || !request.purpose.trim() || !request.dataClass.trim()) throw new Error("EGRESS_CONTEXT_REQUIRED");
  let u:URL; try{u=new URL(request.url)}catch{throw new Error("EGRESS_URL_INVALID")}
  const protocols=policy.allowedProtocols??["https:"];
  if(!protocols.includes(u.protocol)) throw new Error("EGRESS_PROTOCOL_DENIED");
  const host=u.hostname.toLowerCase().replace(/\\.$/,"");
  if(privateHost.test(host)) throw new Error("EGRESS_PRIVATE_TARGET_DENIED");
  if((policy.blockedHosts??[]).some(h=>h.toLowerCase()===host)) throw new Error("EGRESS_HOST_BLOCKED");
  if(!policy.allowedHosts.some(h=>host===h.toLowerCase() || host.endsWith("."+h.toLowerCase()))) throw new Error("EGRESS_HOST_NOT_ALLOWED");
}