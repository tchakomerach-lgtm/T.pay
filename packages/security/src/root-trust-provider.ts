import type { Pool } from "pg";
import { verify, createPublicKey } from "node:crypto";
import { requestDigest } from "./super-admin-control.js";
export interface RootApprovalInput{actorId:string;domain:string;algorithm:"ES256"|"Ed25519";signature:Buffer;publicKeyDer:Buffer;}
export interface RootTrustProvider{kind:"HSM"|"KMS"|"SOFTWARE_TEST";verify(input:{algorithm:"ES256"|"Ed25519";publicKeyDer:Buffer;signature:Buffer;digest:string}):Promise<boolean>;signingKeyRef:string;}
export class NodeVerificationProvider implements RootTrustProvider{
 kind="SOFTWARE_TEST" as const; constructor(public signingKeyRef="software-test-only"){}
 async verify(i:{algorithm:"ES256"|"Ed25519";publicKeyDer:Buffer;signature:Buffer;digest:string}):Promise<boolean>{const key=createPublicKey({key:i.publicKeyDer,format:"der",type:"spki"});return i.algorithm==="Ed25519"?verify(null,Buffer.from(i.digest),key,i.signature):verify("sha256",Buffer.from(i.digest),key,i.signature);}
}
export async function authorizeRootOperationWithQuorum(pool:Pool,input:{operation:string;request:unknown;expiresAt:Date;approvals:RootApprovalInput[];provider:RootTrustProvider}){
 if(input.approvals.length<3)throw new Error("ROOT_QUORUM_REQUIRED");
 const digest=requestDigest(input.request);
 const domains=new Set(input.approvals.map(x=>x.domain)); if(domains.size<3)throw new Error("ROOT_INDEPENDENCE_REQUIRED");
 const c=await pool.connect();try{await c.query("BEGIN");
  const duplicate=await c.query("SELECT 1 FROM tpay_root_operations WHERE request_digest=$1 AND status IN ('AUTHORIZED','EXECUTED') FOR UPDATE",[digest]);if(duplicate.rowCount)throw new Error("ROOT_REQUEST_REPLAY");
  for(const a of input.approvals){
   const ok=await input.provider.verify({algorithm:a.algorithm,publicKeyDer:a.publicKeyDer,signature:a.signature,digest});if(!ok)throw new Error("ROOT_SIGNATURE_INVALID");
   const identity=(await c.query("SELECT id,active,expires_at,privileged_level FROM tpay_privileged_identities WHERE id=$1",[a.actorId])).rows[0];
   if(!identity?.active||new Date(identity.expires_at)<=new Date()||!["L5_ROOT_TRUST","L4_SUPER_ADMIN"].includes(String(identity.privileged_level)))throw new Error("ROOT_APPROVER_INVALID");
  }
  const id=(await c.query("INSERT INTO tpay_root_operations(id,operation,actor_ids,independent_domains,request_digest,created_at,expires_at,status,quorum_required) VALUES(gen_random_uuid(),$1,$2,$3,$4,now(),$5,'AUTHORIZED',3) RETURNING id",[input.operation,JSON.stringify(input.approvals.map(x=>x.actorId)),JSON.stringify([...domains]),digest,input.expiresAt])).rows[0].id;
  for(const a of input.approvals)await c.query("INSERT INTO tpay_root_approvals(operation_id,actor_id,independent_domain,signature_format,signature,signed_digest) VALUES($1,$2,$3,$4,$5,$6)",[id,a.actorId,a.domain,a.algorithm,a.signature,digest]);
  await c.query("COMMIT");return{operationId:String(id),digest,status:"AUTHORIZED" as const};
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release();}
}

export function assertProductionRootProvider(provider:RootTrustProvider){
 if(process.env.NODE_ENV==="production"&&provider.kind==="SOFTWARE_TEST")throw new Error("ROOT_HARDWARE_PROVIDER_REQUIRED");
}
