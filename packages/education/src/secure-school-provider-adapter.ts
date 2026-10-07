import { requestJson } from "../../api-gateway/src/https-client.js";
import { executeProviderCall, ProviderCircuitBreaker, type ProviderResiliencePolicy } from "../../finance/src/provider-resilience.js";
import { verifyProviderCallbackSignature, type ProviderCallbackEnvelope } from "../../security/src/provider-callback.js";

export type SchoolProviderAdapterConfig={
 providerId:string; baseUrl:string; allowedHosts:readonly string[]; callbackSecret:string;
 resilience:ProviderResiliencePolicy;
};

export type SchoolProviderCommand={operation:string; requestId:string; payload:Record<string,unknown>};
export type SchoolProviderResult={providerId:string;requestId:string;status:"ACCEPTED"|"PENDING"|"CONFIRMED"|"REJECTED";data:Record<string,unknown>};

export class SecureSchoolProviderAdapter{
 private readonly breaker:ProviderCircuitBreaker;
 constructor(private readonly config:SchoolProviderAdapterConfig){
  if(!config.callbackSecret)throw new Error("PROVIDER_CALLBACK_SECRET_REQUIRED");
  const u=new URL(config.baseUrl);
  if(u.protocol!=="https:")throw new Error("PROVIDER_HTTPS_REQUIRED");
  if(!config.allowedHosts.includes(u.hostname.toLowerCase()))throw new Error("PROVIDER_HOST_NOT_ALLOWLISTED");
  this.breaker=new ProviderCircuitBreaker(config.resilience.circuit);
 }
 async execute(command:SchoolProviderCommand):Promise<SchoolProviderResult>{
  if(!command.requestId)throw new Error("PROVIDER_REQUEST_ID_REQUIRED");
  const url=`${this.config.baseUrl.replace(/\/$/,"")}/v1/education/${encodeURIComponent(command.operation)}`;
  return executeProviderCall(async()=>{
   const response=await requestJson<SchoolProviderResult>({endpoint:url,allowedHosts:this.config.allowedHosts,method:"POST",headers:{"x-provider-request-id":command.requestId},body:{requestId:command.requestId,payload:command.payload},timeoutMs:10000});
   return response.data;
  },this.config.resilience,this.breaker);
 }
 verifyCallback(envelope:ProviderCallbackEnvelope,now=Math.floor(Date.now()/1000)):void{
  if(envelope.providerId!==this.config.providerId)throw new Error("PROVIDER_ID_MISMATCH");
  verifyProviderCallbackSignature(this.config.callbackSecret,envelope,300,now);
 }
}
