export type ApiVersion="v1";
export type ApiVersionState="active"|"deprecated"|"sunset";

export interface ApiVersionPolicy{
  version:ApiVersion;
  state:ApiVersionState;
  sunsetAt?:string;
  replacement?:ApiVersion;
}

export const API_VERSION_POLICIES:readonly ApiVersionPolicy[]=[
  {version:"v1",state:"active"}
];

export function parseApiVersion(route:string):ApiVersion|null{
  const match=/^\/v([0-9]+)(?:\/|$)/.exec(route);
  if(!match)return null;
  return ("v"+match[1]) as ApiVersion;
}

export function resolveApiVersion(route:string):ApiVersionPolicy{
  const version=parseApiVersion(route);
  if(!version)throw new Error("API_VERSION_MISSING");
  const policy=API_VERSION_POLICIES.find(item=>item.version===version);
  if(!policy)throw new Error("API_VERSION_UNSUPPORTED");
  if(policy.state==="sunset")throw new Error("API_VERSION_SUNSET");
  return policy;
}

export function assertApiVersionCompatibility(route:string):void{
  resolveApiVersion(route);
}
