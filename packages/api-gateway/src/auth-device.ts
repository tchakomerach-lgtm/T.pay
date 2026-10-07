import {createHash,randomUUID,timingSafeEqual} from "node:crypto";
export type DeviceStatus="active"|"locked"|"revoked";
export type SessionStatus="active"|"revoked"|"expired";
export interface AuthDb{query(sql:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount:number|null}>;}
const HEX64=/^[a-f0-9]{64}$/;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const equalHash=(a:string,b:string)=>{if(!HEX64.test(a)||!HEX64.test(b))return false;return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));};
export function hashCredential(secret:string):string{if(secret.length<16||secret.length>512)throw new Error("AUTH_CREDENTIAL_INVALID");return hash(secret);}
export function assertHttpsOrigin(origin:string):void{let u:URL;try{u=new URL(origin);}catch{throw new Error("AUTH_ORIGIN_INVALID");}if(u.protocol!=="https:")throw new Error("AUTH_HTTPS_REQUIRED");}
export class DeviceTrustRepository{
 constructor(private readonly db:AuthDb){}
 async register(input:{organizationId?:string;actorId:string;deviceCredential:string;label:string;sharedDevice:boolean;now:string}):Promise<string>{
  if(input.label.length<1||input.label.length>120)throw new Error("AUTH_DEVICE_LABEL_INVALID");
  const id=randomUUID();const keyHash=hashCredential(input.deviceCredential);
  await this.db.query("INSERT INTO api_devices(id,organization_id,actor_id,device_key_hash,device_label,shared_device,status,trust_epoch,failed_auth_count,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'active',1,0,$7::timestamptz,$7::timestamptz)",[id,input.organizationId??null,input.actorId,keyHash,input.label,input.sharedDevice,input.now]);
  return id;
 }
 async verifyDevice(input:{deviceId:string;credential:string;now:string}):Promise<{trusted:boolean;trustEpoch?:number;organizationId?:string;actorId?:string}>{
  const r=await this.db.query("SELECT organization_id,actor_id,device_key_hash,status,trust_epoch,locked_until FROM api_devices WHERE id=$1",[input.deviceId]);
  const row=r.rows[0];if(!row)return {trusted:false};
  if(String(row.status)!=="active")return {trusted:false};
  if(row.locked_until!=null&&new Date(String(row.locked_until)).getTime()>Date.parse(input.now))return {trusted:false};
  const supplied=hashCredential(input.credential);
  if(!equalHash(String(row.device_key_hash),supplied)){
   await this.db.query("UPDATE api_devices SET failed_auth_count=failed_auth_count+1,locked_until=CASE WHEN failed_auth_count+1>=5 THEN $2::timestamptz ELSE locked_until END,updated_at=$2::timestamptz WHERE id=$1 AND status='active'",[input.deviceId,input.now]);
   return {trusted:false};
  }
  await this.db.query("UPDATE api_devices SET failed_auth_count=0,locked_until=NULL,last_seen_at=$2::timestamptz,updated_at=$2::timestamptz WHERE id=$1 AND status='active'",[input.deviceId,input.now]);
  const result:{trusted:true;trustEpoch?:number;organizationId?:string;actorId?:string}={trusted:true,trustEpoch:Number(row.trust_epoch)};
  if(row.organization_id!=null)result.organizationId=String(row.organization_id);
  result.actorId=String(row.actor_id);return result;
 }
 async revokeDevice(deviceId:string,now:string):Promise<void>{
  await this.db.query("UPDATE api_devices SET status='revoked',trust_epoch=trust_epoch+1,updated_at=$2::timestamptz WHERE id=$1 AND status<>'revoked'",[deviceId,now]);
  await this.db.query("UPDATE api_sessions SET status='revoked',revoked_at=$2::timestamptz WHERE device_id=$1 AND status='active'",[deviceId,now]);
 }
 async createSession(input:{organizationId?:string;actorId:string;deviceId:string;sessionCredential:string;trustEpoch:number;issuedAt:string;expiresAt:string}):Promise<string>{
  if(input.trustEpoch<1)throw new Error("AUTH_TRUST_EPOCH_INVALID");
  const id=randomUUID();const sessionHash=hashCredential(input.sessionCredential);
  await this.db.query("INSERT INTO api_sessions(id,organization_id,actor_id,device_id,session_hash,status,trust_epoch,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,'active',$6,$7::timestamptz,$8::timestamptz)",[id,input.organizationId??null,input.actorId,input.deviceId,sessionHash,input.trustEpoch,input.issuedAt,input.expiresAt]);
  return id;
 }
 async validateSession(input:{sessionCredential:string;now:string}):Promise<{valid:boolean;sessionId?:string;organizationId?:string;actorId?:string;deviceId?:string;issuedAt?:string;expiresAt?:string}>{
  const sessionHash=hashCredential(input.sessionCredential);
  const r=await this.db.query("SELECT s.id,s.organization_id,s.actor_id,s.device_id,s.status,s.issued_at,s.expires_at,s.trust_epoch,d.status AS device_status,d.trust_epoch AS device_epoch FROM api_sessions s JOIN api_devices d ON d.id=s.device_id WHERE s.session_hash=$1",[sessionHash]);
  const row=r.rows[0];if(!row)return {valid:false};
  if(String(row.status)!=="active"||String(row.device_status)!=="active"||Date.parse(String(row.expires_at))<=Date.parse(input.now)||Number(row.trust_epoch)!==Number(row.device_epoch))return {valid:false};
  await this.db.query("UPDATE api_sessions SET last_seen_at=$2::timestamptz WHERE id=$1 AND status='active'",[row.id,input.now]);
  const out:{valid:true;sessionId?:string;organizationId?:string;actorId?:string;deviceId?:string;issuedAt?:string;expiresAt?:string}={valid:true,sessionId:String(row.id),actorId:String(row.actor_id),deviceId:String(row.device_id),issuedAt:String(row.issued_at),expiresAt:String(row.expires_at)};
  if(row.organization_id!=null)out.organizationId=String(row.organization_id);return out;
 }
}