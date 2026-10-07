import type { SecureHttpsAdapter, SecureHttpResponse } from "./secure-http-adapter.js";

export type ProviderEnvironment="sandbox"|"staging"|"production";
export type ProviderHealth="UNKNOWN"|"HEALTHY"|"DEGRADED"|"BLOCKED";
export type MtlsMode="disabled"|"required"|"preferred";

export interface ProviderCredentialRef{secretRef:string;certificateRef?:string;privateKeyRef?:string}
export interface ProviderRegistration{
  id:string;environment:ProviderEnvironment;allowedOrigins:readonly string[];
  credential:ProviderCredentialRef;mtls:MtlsMode;enabled:boolean;health:ProviderHealth;
  capabilities:readonly string[];
}
export interface ProviderCertificationResult{
  providerId:string;environment:ProviderEnvironment;passed:boolean;
  checks:ReadonlyArray<{name:string;passed:boolean;detail:string}>;
}
export interface ProviderProbe{
  path:string;method:"GET"|"POST";idempotent:boolean;
  headers?:Record<string,string>;body?:Uint8Array;
}
export type ProviderCaller=(provider:ProviderRegistration,probe:ProviderProbe)=>Promise<SecureHttpResponse>;

function validateOrigin(origin:string):void{
  const url=new URL(origin);
  if(url.protocol!=="https:")throw new Error("PROVIDER_HTTPS_REQUIRED");
  if(url.username||url.password)throw new Error("PROVIDER_CREDENTIALS_IN_URL_FORBIDDEN");
}
function validateCredential(ref:ProviderCredentialRef):void{
  if(!ref.secretRef||ref.secretRef.includes(" "))throw new Error("PROVIDER_SECRET_REF_INVALID");
  if(ref.certificateRef&&!ref.privateKeyRef)throw new Error("PROVIDER_PRIVATE_KEY_REF_REQUIRED");
}
export class ProviderRegistry{
  private readonly providers=new Map<string,ProviderRegistration>();
  register(input:ProviderRegistration):void{
    if(!input.id)throw new Error("PROVIDER_ID_REQUIRED");
    if(this.providers.has(input.id))throw new Error("PROVIDER_DUPLICATE");
    if(input.allowedOrigins.length===0)throw new Error("PROVIDER_ENDPOINT_REQUIRED");
    input.allowedOrigins.forEach(validateOrigin);validateCredential(input.credential);
    if(input.environment==="production"&&input.mtls==="disabled")throw new Error("PROVIDER_PRODUCTION_MTLS_POLICY");
    this.providers.set(input.id,Object.freeze({...input,allowedOrigins:Object.freeze([...input.allowedOrigins]),capabilities:Object.freeze([...input.capabilities])}));
  }
  get(id:string):ProviderRegistration{
    const provider=this.providers.get(id);if(!provider)throw new Error("PROVIDER_NOT_REGISTERED");return provider;
  }
  block(id:string):void{const p=this.get(id);this.providers.set(id,Object.freeze({...p,enabled:false,health:"BLOCKED"}));}
  enable(id:string):void{const p=this.get(id);if(p.health==="BLOCKED")throw new Error("PROVIDER_BLOCKED_REQUIRES_REVIEW");this.providers.set(id,Object.freeze({...p,enabled:true}));}
  list():ProviderRegistration[]{return [...this.providers.values()];}
}
export async function certifyProvider(registry:ProviderRegistry,providerId:string,probes:readonly ProviderProbe[],caller:ProviderCaller):Promise<ProviderCertificationResult>{
  const provider=registry.get(providerId);
  const checks:{name:string;passed:boolean;detail:string}[]=[];
  checks.push({name:"HTTPS_ENDPOINTS",passed:provider.allowedOrigins.every(o=>new URL(o).protocol==="https:"),detail:"All registered origins use HTTPS."});
  checks.push({name:"CREDENTIAL_REFERENCES",passed:!!provider.credential.secretRef,detail:"Credentials are references, never inline secrets."});
  checks.push({name:"PRODUCTION_MTLS",passed:provider.environment!=="production"||provider.mtls!=="disabled",detail:"Production provider requires mTLS policy."});
  for(const probe of probes){
    if(!probe.path.startsWith("/")){checks.push({name:"PROBE_PATH",passed:false,detail:"Provider probe path must be relative."});continue;}
    try{
      const result=await caller(provider,probe);
      const passed=result.state==="CONFIRMED"||result.state==="PENDING";
      checks.push({name:`PROBE_${probe.method}_${probe.path}`,passed,detail:`Provider returned ${result.state}.`});
    }catch(error){
      checks.push({name:`PROBE_${probe.method}_${probe.path}`,passed:false,detail:error instanceof Error?error.message:"PROBE_FAILED"});
    }
  }
  const passed=checks.every(c=>c.passed);
  return {providerId,environment:provider.environment,passed,checks};
}
