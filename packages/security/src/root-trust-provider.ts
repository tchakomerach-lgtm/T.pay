import type { Pool } from "pg";
import { verify, createPublicKey } from "node:crypto";
import { requestDigest } from "./super-admin-control.js";

export interface RootApprovalInput {
 actorId:string;
 domain:string;
 algorithm:"ES256"|"Ed25519";
 signature:Buffer;
 publicKeyDer?:Buffer;
 credentialId?:string;
}
export interface RootTrustProvider {
 kind:"HSM"|"KMS"|"SOFTWARE_TEST";
 verify(input:{algorithm:"ES256"|"Ed25519";publicKeyDer:Buffer;signature:Buffer;digest:string}):Promise<boolean>;
 signingKeyRef:string;
}
export class NodeVerificationProvider implements RootTrustProvider {
 kind="SOFTWARE_TEST" as const;
 constructor(public signingKeyRef="software-test-only"){}
 async verify(i:{algorithm:"ES256"|"Ed25519";publicKeyDer:Buffer;signature:Buffer;digest:string}):Promise<boolean>{
  const key=createPublicKey({key:i.publicKeyDer,format:"der",type:"spki"});
  return i.algorithm==="Ed25519"?verify(null,Buffer.from(i.digest),key,i.signature):verify("sha256",Buffer.from(i.digest),key,i.signature);
 }
}
export function assertProductionRootProvider(provider:RootTrustProvider){
 if(process.env.NODE_ENV==="production"&&provider.kind==="SOFTWARE_TEST")throw new Error("ROOT_HARDWARE_PROVIDER_REQUIRED");
}
export async function authorizeRootOperationWithQuorum(pool:Pool,input:{operation:string;request:unknown;expiresAt:Date;approvals:RootApprovalInput[];provider:RootTrustProvider}){
 assertProductionRootProvider(input.provider);
 if(!input.operation.trim())throw new Error("ROOT_OPERATION_REQUIRED");
 const now=Date.now();
 if(!Number.isFinite(input.expiresAt.getTime())||input.expiresAt.getTime()<=now||input.expiresAt.getTime()>now+5*60_000)throw new Error("ROOT_APPROVAL_TTL_INVALID");
 if(input.approvals.length<3)throw new Error("ROOT_QUORUM_REQUIRED");
 const actorIds=input.approvals.map(x=>x.actorId);
 if(new Set(actorIds).size!==actorIds.length)throw new Error("ROOT_DUPLICATE_ACTOR");
 const domains=new Set(input.approvals.map(x=>x.domain));
 if(domains.size<3)throw new Error("ROOT_INDEPENDENCE_REQUIRED");
 const digest=requestDigest(input.request);
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const duplicate=await c.query("SELECT 1 FROM tpay_root_operations WHERE request_digest=$1 AND status IN ('AUTHORIZED','EXECUTED') FOR UPDATE",[digest]);
  if(duplicate.rowCount)throw new Error("ROOT_REQUEST_REPLAY");
  for(const a of input.approvals){
   const identity=(await c.query("SELECT id,active,expires_at,privileged_level,trust_domain FROM tpay_privileged_identities WHERE id=$1 FOR SHARE",[a.actorId])).rows[0];
   if(!identity?.active||new Date(identity.expires_at)<=new Date()||!["L5_ROOT_TRUST","L4_SUPER_ADMIN"].includes(String(identity.privileged_level)))throw new Error("ROOT_APPROVER_INVALID");
   if(!identity.trust_domain||String(identity.trust_domain)!==a.domain)throw new Error("ROOT_TRUST_DOMAIN_MISMATCH");
   let publicKeyDer=a.publicKeyDer;
   let hardwareBacked=false;
   if(a.credentialId){
    const key=(await c.query("SELECT public_key_der,algorithm,hardware_backed,active FROM tpay_privileged_verification_keys WHERE privileged_identity_id=$1 AND credential_id=$2 FOR SHARE",[a.actorId,a.credentialId])).rows[0];
    if(!key?.active||String(key.algorithm)!==a.algorithm)throw new Error("ROOT_VERIFICATION_KEY_INVALID");
    publicKeyDer=Buffer.from(key.public_key_der); hardwareBacked=Boolean(key.hardware_backed);
   }else if(process.env.NODE_ENV==="production"){
    throw new Error("ROOT_REGISTERED_KEY_REQUIRED");
   }
   if(process.env.NODE_ENV==="production"&&!hardwareBacked)throw new Error("ROOT_HARDWARE_KEY_REQUIRED");
   if(!publicKeyDer)throw new Error("ROOT_PUBLIC_KEY_REQUIRED");
   if(!await input.provider.verify({algorithm:a.algorithm,publicKeyDer,signature:a.signature,digest}))throw new Error("ROOT_SIGNATURE_INVALID");
  }
  const id=(await c.query("INSERT INTO tpay_root_operations(id,operation,actor_ids,independent_domains,request_digest,created_at,expires_at,status,quorum_required) VALUES(gen_random_uuid(),$1,$2,$3,$4,now(),$5,'AUTHORIZED',3) RETURNING id",[input.operation,JSON.stringify(actorIds),JSON.stringify([...domains]),digest,input.expiresAt])).rows[0].id;
  for(const a of input.approvals)await c.query("INSERT INTO tpay_root_approvals(operation_id,actor_id,independent_domain,signature_format,signature,signed_digest) VALUES($1,$2,$3,$4,$5,$6)",[id,a.actorId,a.domain,a.algorithm==="Ed25519"?"ED25519":"ECDSA_P256_SHA256",a.signature,digest]);
  await c.query("COMMIT");
  return{operationId:String(id),digest,status:"AUTHORIZED" as const};
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release();}
}
