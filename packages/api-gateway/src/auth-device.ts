import {createHash,randomUUID,timingSafeEqual} from "node:crypto";

export type DeviceStatus="active"|"locked"|"revoked";
export type SessionStatus="active"|"revoked"|"expired";
export interface AuthDb{
 query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}>;
 withTenantTransaction?<T>(tenantId:string,work:(client:AuthDb)=>Promise<T>):Promise<T>;
}
const HEX64=/^[a-f0-9]{64}$/;
const TENANT=/^[A-Za-z0-9_-]{1,128}$/;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const equalHash=(a:string,b:string)=>HEX64.test(a)&&HEX64.test(b)&&timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));

export function hashCredential(secret:string):string{
 if(secret.length<16||secret.length>512)throw new Error("AUTH_CREDENTIAL_INVALID");
 return hash(secret);
}
export function issueTenantBoundSessionCredential(tenantId:string,secret:string):string{
 if(!TENANT.test(tenantId))throw new Error("AUTH_TENANT_ID_INVALID");
 if(secret.length<16||secret.length>400)throw new Error("AUTH_CREDENTIAL_INVALID");
 return `tpay1.${tenantId}.${secret}`;
}
export function readSessionTenantId(credential:string):string{
 const parts=credential.split(".");
 if(parts.length!==3||parts[0]!=="tpay1"||!TENANT.test(parts[1]??"")||(parts[2]?.length??0)<16)throw new Error("AUTH_SESSION_TENANT_CLAIM_REQUIRED");
 return parts[1]!;
}
export function assertHttpsOrigin(origin:string):void{
 let u:URL;
 try{u=new URL(origin);}catch{throw new Error("AUTH_ORIGIN_INVALID");}
 if(u.protocol!=="https:")throw new Error("AUTH_HTTPS_REQUIRED");
}

export class DeviceTrustRepository{
 constructor(private readonly db:AuthDb){}
 async register(input:{tenantId:string;organizationId?:string;actorId:string;deviceCredential:string;label:string;sharedDevice:boolean;now:string}):Promise<string>{
  if(!TENANT.test(input.tenantId))throw new Error("AUTH_TENANT_ID_INVALID");
  if(input.label.length<1||input.label.length>120)throw new Error("AUTH_DEVICE_LABEL_INVALID");
  const id=randomUUID(),keyHash=hashCredential(input.deviceCredential);
  await this.db.query(
   "INSERT INTO api_devices(id,tenant_id,organization_id,actor_id,device_key_hash,device_label,shared_device,status,trust_epoch,failed_auth_count,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'active',1,0,$8::timestamptz,$8::timestamptz)",
   [id,input.tenantId,input.organizationId??null,input.actorId,keyHash,input.label,input.sharedDevice,input.now]
  );
  return id;
 }
 async verifyDevice(input:{tenantId:string;deviceId:string;credential:string;now:string}):Promise<{trusted:boolean;tenantId?:string;trustEpoch?:number;organizationId?:string;actorId?:string}>{
  if(!TENANT.test(input.tenantId))return {trusted:false};
  const r=await this.db.query(
   "SELECT tenant_id,organization_id,actor_id,device_key_hash,status,trust_epoch,locked_until FROM api_devices WHERE id=$1 AND tenant_id=$2",
   [input.deviceId,input.tenantId]
  );
  const row=r.rows[0];
  if(!row||String(row.status)!=="active")return {trusted:false};
  if(row.locked_until!=null&&new Date(String(row.locked_until)).getTime()>Date.parse(input.now))return {trusted:false};
  const supplied=hashCredential(input.credential);
  if(!equalHash(String(row.device_key_hash),supplied)){
   await this.db.query("UPDATE api_devices SET failed_auth_count=failed_auth_count+1,locked_until=CASE WHEN failed_auth_count+1>=5 THEN $3::timestamptz ELSE locked_until END,updated_at=$3::timestamptz WHERE id=$1 AND tenant_id=$2 AND status='active'",[input.deviceId,input.tenantId,input.now]);
   return {trusted:false};
  }
  await this.db.query("UPDATE api_devices SET failed_auth_count=0,locked_until=NULL,last_seen_at=$3::timestamptz,updated_at=$3::timestamptz WHERE id=$1 AND tenant_id=$2 AND status='active'",[input.deviceId,input.tenantId,input.now]);
  const result:{trusted:true;tenantId?:string;trustEpoch?:number;organizationId?:string;actorId?:string}={trusted:true,tenantId:String(row.tenant_id),trustEpoch:Number(row.trust_epoch),actorId:String(row.actor_id)};
  if(row.organization_id!=null)result.organizationId=String(row.organization_id);
  return result;
 }
 async revokeDevice(input:{tenantId:string;deviceId:string;now:string}):Promise<void>{
  if(!TENANT.test(input.tenantId))throw new Error("AUTH_TENANT_ID_INVALID");
  await this.db.query("UPDATE api_devices SET status='revoked',trust_epoch=trust_epoch+1,updated_at=$3::timestamptz WHERE id=$1 AND tenant_id=$2 AND status<>'revoked'",[input.deviceId,input.tenantId,input.now]);
  await this.db.query("UPDATE api_sessions SET status='revoked',revoked_at=$3::timestamptz WHERE device_id=$1 AND tenant_id=$2 AND status='active'",[input.deviceId,input.tenantId,input.now]);
 }
 async createSession(input:{tenantId:string;organizationId?:string;actorId:string;deviceId:string;sessionCredential:string;trustEpoch:number;issuedAt:string;expiresAt:string}):Promise<string>{
  if(!TENANT.test(input.tenantId))throw new Error("AUTH_TENANT_ID_INVALID");
  if(readSessionTenantId(input.sessionCredential)!==input.tenantId)throw new Error("AUTH_SESSION_TENANT_MISMATCH");
  if(input.trustEpoch<1)throw new Error("AUTH_TRUST_EPOCH_INVALID");
  if(Date.parse(input.expiresAt)<=Date.parse(input.issuedAt))throw new Error("AUTH_SESSION_EXPIRY_INVALID");
  const id=randomUUID(),sessionHash=hashCredential(input.sessionCredential);
  const saved=await this.db.query(
   "INSERT INTO api_sessions(id,tenant_id,organization_id,actor_id,device_id,session_hash,status,trust_epoch,issued_at,expires_at) SELECT $1,$2,$3,$4,$5,$6,'active',$7,$8::timestamptz,$9::timestamptz FROM api_devices d WHERE d.id=$5 AND d.tenant_id=$2 AND d.actor_id=$4 AND d.status='active' AND d.trust_epoch=$7 RETURNING id",
   [id,input.tenantId,input.organizationId??null,input.actorId,input.deviceId,sessionHash,input.trustEpoch,input.issuedAt,input.expiresAt]
  );
  if((saved.rowCount??0)!==1)throw new Error("AUTH_DEVICE_SESSION_BINDING_INVALID");
  return id;
 }
 async validateSession(input:{sessionCredential:string;now:string}):Promise<{valid:boolean;tenantId?:string;sessionId?:string;organizationId?:string;actorId?:string;deviceId?:string;issuedAt?:string;expiresAt?:string}>{
  let tenantId:string;
  try{tenantId=readSessionTenantId(input.sessionCredential);}catch{return {valid:false};}
  const sessionHash=hashCredential(input.sessionCredential);
  const validate=async(client:AuthDb)=>{
   const r=await client.query(
    "SELECT s.id,s.tenant_id,s.organization_id,s.actor_id,s.device_id,s.status,s.issued_at,s.expires_at,s.trust_epoch,d.status AS device_status,d.trust_epoch AS device_epoch FROM api_sessions s JOIN api_devices d ON d.id=s.device_id AND d.tenant_id=s.tenant_id WHERE s.session_hash=$1 AND s.tenant_id=$2 FOR SHARE OF s",
    [sessionHash,tenantId]
   );
   const row=r.rows[0];
   if(!row||String(row.tenant_id)!==tenantId||String(row.status)!=="active"||String(row.device_status)!=="active"||Date.parse(String(row.expires_at))<=Date.parse(input.now)||Number(row.trust_epoch)!==Number(row.device_epoch))return {valid:false} as const;
   const updated=await client.query("UPDATE api_sessions SET last_seen_at=$3::timestamptz WHERE id=$1 AND tenant_id=$2 AND status='active'",[row.id,tenantId,input.now]);
   if((updated.rowCount??0)!==1)return {valid:false} as const;
   const out:{valid:true;tenantId?:string;sessionId?:string;organizationId?:string;actorId?:string;deviceId?:string;issuedAt?:string;expiresAt?:string}={
    valid:true,tenantId,sessionId:String(row.id),actorId:String(row.actor_id),deviceId:String(row.device_id),issuedAt:String(row.issued_at),expiresAt:String(row.expires_at)
   };
   if(row.organization_id!=null)out.organizationId=String(row.organization_id);
   return out;
  };
  return this.db.withTenantTransaction
   ? await this.db.withTenantTransaction(tenantId,validate)
   : await validate(this.db);
 }
}
