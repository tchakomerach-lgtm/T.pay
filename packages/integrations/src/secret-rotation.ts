export type SecretKind="api_key"|"client_certificate"|"private_key"|"webhook_secret";
export type SecretState="ACTIVE"|"EXPIRING"|"EXPIRED"|"REVOKED"|"ROTATION_REQUIRED";

export interface SecretVersion{
  id:string;providerId:string;kind:SecretKind;version:number;secretRef:string;
  notBefore:string;expiresAt:string;state:SecretState;
}
export interface SecretStore{
  getActive(providerId:string,kind:SecretKind):Promise<SecretVersion|null>;
  putVersion(version:SecretVersion):Promise<void>;
  revoke(versionId:string,reason:string):Promise<void>;
}
export interface SecretClock{now():number}

export class SecretRotationManager{
  constructor(private readonly store:SecretStore,private readonly clock:SecretClock={now:()=>Date.now()},private readonly expiryWarningMs=7*86400000){}
  async select(providerId:string,kind:SecretKind):Promise<SecretVersion>{
    const active=await this.store.getActive(providerId,kind);
    if(!active)throw new Error("SECRET_ACTIVE_VERSION_MISSING");
    const now=this.clock.now();const start=Date.parse(active.notBefore);const expiry=Date.parse(active.expiresAt);
    if(!Number.isFinite(start)||!Number.isFinite(expiry)||expiry<=start)throw new Error("SECRET_VERSION_WINDOW_INVALID");
    if(active.state==="REVOKED"||active.state==="EXPIRED")throw new Error("SECRET_VERSION_UNUSABLE");
    if(expiry<=now)throw new Error("SECRET_EXPIRED");
    if(expiry-now<=this.expiryWarningMs&&active.state==="ACTIVE"){
      const expiring={...active,state:"EXPIRING" as const};await this.store.putVersion(expiring);return expiring;
    }
    return active;
  }
  async activateNext(providerId:string,kind:SecretKind,next:SecretVersion):Promise<void>{
    const current=await this.store.getActive(providerId,kind);
    if(!next.secretRef||next.secretRef.includes(" "))throw new Error("SECRET_REF_INVALID");
    if(next.providerId!==providerId||next.kind!==kind)throw new Error("SECRET_SCOPE_MISMATCH");
    if(next.version<1||current&&next.version<=current.version)throw new Error("SECRET_VERSION_NOT_MONOTONIC");
    if(Date.parse(next.notBefore)<this.clock.now()-60000)throw new Error("SECRET_NOT_BEFORE_INVALID");
    if(Date.parse(next.expiresAt)<=Date.parse(next.notBefore))throw new Error("SECRET_EXPIRY_INVALID");
    await this.store.putVersion({...next,state:"ACTIVE"});
  }
  async revoke(versionId:string,reason:string):Promise<void>{
    if(!reason.trim())throw new Error("SECRET_REVOCATION_REASON_REQUIRED");
    await this.store.revoke(versionId,reason);
  }
}
