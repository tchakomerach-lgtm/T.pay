export type ProviderEnvironment="SANDBOX"|"STAGING"|"PRODUCTION";
export type ProviderCertificationStatus="PASS"|"BLOCKED";
export interface ProviderEndpointCertificate{subject:string;issuer:string;notBefore:string;notAfter:string;fingerprintSha256:string;}
export interface ProviderAdapterCertificationInput{providerId:string;environment:ProviderEnvironment;baseUrl:string;endpointAllowlisted:boolean;tlsValidated:boolean;mTlsValidated:boolean;certificate?:ProviderEndpointCertificate;webhookSignatureValidated:boolean;replayProtectionValidated:boolean;credentialsRotationDays:number;now:string;}
export interface ProviderAdapterCertification{providerId:string;environment:ProviderEnvironment;status:ProviderCertificationStatus;blockingReasons:string[];checkedAt:string;}
const HEX64=/^[a-f0-9]{64}$/i;
export function certifyProviderAdapter(input:ProviderAdapterCertificationInput):ProviderAdapterCertification{
 const blocking:string[]=[];let url:URL;
 try{url=new URL(input.baseUrl);}catch{blocking.push("INVALID_URL");url=new URL("https://invalid.local");}
 if(url.protocol!=="https:")blocking.push("HTTPS_REQUIRED");
 if(!input.providerId)blocking.push("PROVIDER_ID_REQUIRED");
 if(!input.endpointAllowlisted)blocking.push("ENDPOINT_NOT_ALLOWLISTED");
 if(!input.tlsValidated)blocking.push("TLS_NOT_VALIDATED");
 if(!input.webhookSignatureValidated)blocking.push("WEBHOOK_SIGNATURE_NOT_VALIDATED");
 if(!input.replayProtectionValidated)blocking.push("WEBHOOK_REPLAY_NOT_PROTECTED");
 if(input.environment==="PRODUCTION"&&!input.mTlsValidated)blocking.push("MTLS_REQUIRED_FOR_PRODUCTION");
 if(input.credentialsRotationDays<1||input.credentialsRotationDays>90)blocking.push("CREDENTIAL_ROTATION_POLICY_INVALID");
 if(!input.certificate)blocking.push("CERTIFICATE_EVIDENCE_REQUIRED");
 else{
  if(!HEX64.test(input.certificate.fingerprintSha256))blocking.push("CERTIFICATE_FINGERPRINT_INVALID");
  if(Date.parse(input.certificate.notBefore)>Date.parse(input.now))blocking.push("CERTIFICATE_NOT_YET_VALID");
  if(Date.parse(input.certificate.notAfter)<=Date.parse(input.now))blocking.push("CERTIFICATE_EXPIRED");
 }
 return {providerId:input.providerId,environment:input.environment,status:blocking.length?"BLOCKED":"PASS",blockingReasons:blocking,checkedAt:input.now};
}
