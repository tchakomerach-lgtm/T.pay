import { createHash, randomUUID, verify, type KeyObject } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { requestDigest } from "./super-admin-control.js";

export type PrivilegedSession={id:string;grantId:string;principalId:string;resource:string;action:string;expiresAt:string};

async function tx<T>(pool:Pool,fn:(c:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query("BEGIN");const v=await fn(c);await c.query("COMMIT");return v}catch(e){await c.query("ROLLBACK");throw e}finally{c.release();}
}

export async function approveJitGrant(pool:Pool,input:{grantId:string;approverId:string}){
 return tx(pool,async c=>{
  const g=(await c.query("SELECT id,principal_id,expires_at,approval_count,required_approvals,one_shot,consumed_at FROM tpay_privileged_grants WHERE id=$1 FOR UPDATE",[input.grantId])).rows[0];
  if(!g)throw new Error("JIT_GRANT_NOT_FOUND");
  if(g.consumed_at||new Date(g.expires_at)<=new Date())throw new Error("JIT_GRANT_INACTIVE");
  if(String(g.principal_id)===input.approverId)throw new Error("JIT_SELF_APPROVAL_FORBIDDEN");
  const identity=(await c.query("SELECT id,active,expires_at FROM tpay_privileged_identities WHERE id=$1",[input.approverId])).rows[0];
  if(!identity?.active||new Date(identity.expires_at)<=new Date())throw new Error("APPROVER_INVALID");
  const digest=requestDigest({grantId:input.grantId,approverId:input.approverId});
  await c.query("INSERT INTO tpay_jit_approvals(grant_id,approver_id,approval_digest) VALUES($1,$2,$3)",[input.grantId,input.approverId,digest]);
  const n=Number((await c.query("SELECT count(*)::int AS n FROM tpay_jit_approvals WHERE grant_id=$1",[input.grantId])).rows[0].n);
  await c.query("UPDATE tpay_privileged_grants SET approval_count=$2 WHERE id=$1",[input.grantId,n]);
  return {grantId:input.grantId,approvalCount:n,ready:n>=Number(g.required_approvals)};
 });
}

export async function consumeJitGrantAtomically(pool:Pool,input:{grantId:string;principalId:string}):Promise<PrivilegedSession>{
 return tx(pool,async c=>{
  const q=await c.query("SELECT g.*,p.human_user_id FROM tpay_privileged_grants g JOIN tpay_privileged_identities p ON p.id=g.principal_id WHERE g.id=$1 FOR UPDATE",[input.grantId]);
  const g=q.rows[0];
  if(!g)throw new Error("JIT_GRANT_NOT_FOUND");
  if(String(g.principal_id)!==input.principalId)throw new Error("JIT_PRINCIPAL_MISMATCH");
  if(g.consumed_at||new Date(g.expires_at)<=new Date())throw new Error("JIT_GRANT_NOT_ACTIVE");
  if(Number(g.approval_count)<Number(g.required_approvals))throw new Error("JIT_APPROVAL_REQUIRED");
  const existing=await c.query("SELECT id FROM tpay_privileged_sessions WHERE grant_id=$1",[input.grantId]);
  if(existing.rowCount)throw new Error("JIT_GRANT_ALREADY_CONSUMED");
  const id=randomUUID();
  await c.query("INSERT INTO tpay_privileged_sessions(id,grant_id,principal_id,resource,action,expires_at) VALUES($1,$2,$3,$4,$5,$6)",[id,g.id,g.principal_id,g.resource,g.action,g.expires_at]);
  await c.query("UPDATE tpay_privileged_grants SET consumed_at=now() WHERE id=$1",[g.id]);
  return {id,grantId:String(g.id),principalId:String(g.principal_id),resource:String(g.resource),action:String(g.action),expiresAt:new Date(g.expires_at).toISOString()};
 });
}

export async function terminatePrivilegedSession(pool:Pool,sessionId:string){
 await pool.query("UPDATE tpay_privileged_sessions SET terminated_at=now() WHERE id=$1 AND terminated_at IS NULL",[sessionId]);
}
export async function assertPrivilegedSession(pool:Pool,sessionId:string,resource:string,action:string){
 const q=await pool.query("SELECT id,expires_at,terminated_at,resource,action FROM tpay_privileged_sessions WHERE id=$1",[sessionId]);
 const s=q.rows[0];
 if(!s||s.terminated_at||new Date(s.expires_at)<=new Date()||s.resource!==resource||s.action!==action)throw new Error("PRIVILEGED_SESSION_DENIED");
 return s;
}

export function verifyRootApproval(input:{publicKey:KeyObject;signature:Buffer;digest:string}){
 if(!/^[a-f0-9]{64}$/.test(input.digest))throw new Error("ROOT_DIGEST_INVALID");
 const message=Buffer.from(input.digest,"utf8");
 const ok=verify(null,message,input.publicKey,input.signature);
 if(!ok)throw new Error("ROOT_SIGNATURE_INVALID");
 return true;
}
export function keyFingerprint(publicKey:KeyObject){return createHash("sha256").update(publicKey.export({type:"spki",format:"der"})).digest("hex");}
