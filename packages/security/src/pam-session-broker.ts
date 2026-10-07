import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { requestDigest } from "./super-admin-control.js";
import { assertPrivilegedSession, type PrivilegedSession } from "./privileged-session-repository.js";

export type PamConnectorKind="SSH"|"RDP"|"DB"|"K8S"|"CLOUD";
export interface EphemeralCredential{username:string;secretRef:string;expiresAt:Date}
export interface PamConnector{
 readonly kind:PamConnectorKind;
 open(input:{targetRef:string;credential:EphemeralCredential;expiresAt:Date}):Promise<{sessionRef:string}>;
 execute(input:{sessionRef:string;command:string;expiresAt:Date}):Promise<{exitCode:number;outputDigest:string}>;
 terminate(input:{sessionRef:string}):Promise<void>;
}
export interface EphemeralCredentialProvider{
 issue(input:{principalId:string;resource:string;expiresAt:Date}):Promise<EphemeralCredential>;
 revoke(input:{secretRef:string}):Promise<void>;
}
export interface PamPolicy{allowCommand(input:{resource:string;action:string;command:string}):{allowed:boolean;reason:string;commandClass:string}}

export class DenyByDefaultPamPolicy implements PamPolicy{
 allowCommand(input:{resource:string;action:string;command:string}){
  const normalized=input.command.trim();
  if(!normalized)return{allowed:false,reason:"EMPTY_COMMAND",commandClass:"EMPTY"};
  if(/[;&|]/.test(normalized))return{allowed:false,reason:"SHELL_COMPOSITION_FORBIDDEN",commandClass:"COMPOSITE"};
  if(/^\s*(rm|mkfs|dd|shutdown|reboot|poweroff|iptables|nft|useradd|userdel|passwd)\b/i.test(normalized))
   return{allowed:false,reason:"DANGEROUS_COMMAND_FORBIDDEN",commandClass:"DANGEROUS"};
  if(input.action==="read"&&/\b(sudo|su)\b/i.test(normalized))
   return{allowed:false,reason:"PRIVILEGE_ESCALATION_FORBIDDEN",commandClass:"ESCALATION"};
  return{allowed:true,reason:"ALLOWLIST_BASELINE",commandClass:"READ_ONLY"};
 }
}
export class PamSessionBroker{
 constructor(private readonly pool:Pool,private readonly credentials:EphemeralCredentialProvider,private readonly policy:PamPolicy=new DenyByDefaultPamPolicy()){}
 async open(input:{privilegedSession:PrivilegedSession;targetRef:string;connector:PamConnector}){
  await assertPrivilegedSession(this.pool,input.privilegedSession.id,input.privilegedSession.resource,input.privilegedSession.action);
  const expiresAt=new Date(Math.min(Date.parse(input.privilegedSession.expiresAt),Date.now()+15*60_000));
  const credential=await this.credentials.issue({principalId:input.privilegedSession.principalId,resource:input.privilegedSession.resource,expiresAt});
  try{
   const opened=await input.connector.open({targetRef:input.targetRef,credential,expiresAt});
   const id=randomUUID();
   await this.pool.query("INSERT INTO tpay_pam_sessions(id,privileged_session_id,resource,connector_kind,target_ref,lease_expires_at,state,connector_session_ref) VALUES($1,$2,$3,$4,$5,$6,'ACTIVE',$7)",[id,input.privilegedSession.id,input.privilegedSession.resource,input.connector.kind,input.targetRef,expiresAt,opened.sessionRef]);
   return{id,expiresAt,sessionRef:opened.sessionRef};
  }catch(error){await this.credentials.revoke({secretRef:credential.secretRef});throw error;}
 }
 async execute(input:{pamSessionId:string;command:string;actorId:string;connector:PamConnector}){
  const s=(await this.pool.query("SELECT * FROM tpay_pam_sessions WHERE id=$1 FOR UPDATE",[input.pamSessionId])).rows[0];
  if(!s||s.state!=="ACTIVE"||new Date(s.lease_expires_at)<=new Date())throw new Error("PAM_SESSION_NOT_ACTIVE");
  const decision=this.policy.allowCommand({resource:String(s.resource),action:"execute",command:input.command});
  const digest=requestDigest({pamSessionId:input.pamSessionId,command:input.command});
  await this.pool.query("INSERT INTO tpay_pam_commands(id,pam_session_id,command_digest,command_class,decision,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),input.pamSessionId,digest,decision.commandClass,decision.allowed?"ALLOW":"DENY",decision.reason,input.actorId]);
  if(!decision.allowed)throw new Error("PAM_COMMAND_DENIED:"+decision.reason);
  return input.connector.execute({sessionRef:String(s.connector_session_ref),command:input.command,expiresAt:new Date(s.lease_expires_at)});
 }
 async terminate(input:{pamSessionId:string;connector:PamConnector;secretRef?:string}){
  const s=(await this.pool.query("SELECT * FROM tpay_pam_sessions WHERE id=$1 FOR UPDATE",[input.pamSessionId])).rows[0];
  if(!s)return;
  if(s.state==="ACTIVE"&&s.connector_session_ref)await input.connector.terminate({sessionRef:String(s.connector_session_ref)});
  await this.pool.query("UPDATE tpay_pam_sessions SET state='TERMINATED',terminated_at=now() WHERE id=$1 AND state='ACTIVE'",[input.pamSessionId]);
  if(input.secretRef)await this.credentials.revoke({secretRef:input.secretRef});
 }
}
export function assertProductionPamInfrastructure(input:{connector:PamConnector;credentials:EphemeralCredentialProvider}){
 if(process.env.NODE_ENV==="production"&&(!input.connector||!input.credentials))throw new Error("PAM_PRODUCTION_CONNECTORS_REQUIRED");
}
