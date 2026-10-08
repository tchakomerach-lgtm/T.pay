import {createHash} from "node:crypto";
import type {Client} from "pg";

export interface RootControlRequest {
 readonly operationId:string; readonly actorId:string; readonly purpose:string; readonly payloadHash:string; readonly expiresAt:number;
}
export interface RootApproval { readonly operationId:string; readonly approverId:string; readonly role:string; readonly approvedAt:number; readonly approvalHash:string; }

export class RootTrustQuorum {
 constructor(private readonly requiredApprovals=2){}
 private approvals=new Map<string,Map<string,RootApproval>>();
 approve(request:RootControlRequest,approverId:string,role:string,now=Date.now()):void{
  if(request.expiresAt<=now) throw new Error("FORTRESS_ROOT_OPERATION_EXPIRED");
  if(!approverId.trim()||!role.trim()) throw new Error("FORTRESS_ROOT_APPROVER_REQUIRED");
  if(approverId===request.actorId) throw new Error("FORTRESS_ROOT_SEPARATION_OF_DUTIES");
  const map=this.approvals.get(request.operationId)??new Map<string,RootApproval>();
  if(map.has(approverId)) throw new Error("FORTRESS_ROOT_DUPLICATE_APPROVAL");
  const approvalHash=createHash("sha256").update([request.operationId,request.actorId,request.purpose,request.payloadHash,approverId,role].join("|")).digest("hex");
  map.set(approverId,{operationId:request.operationId,approverId,role,approvedAt:now,approvalHash});
  this.approvals.set(request.operationId,map);
 }
 assertQuorum(request:RootControlRequest,now=Date.now()):void{
  if(request.expiresAt<=now) throw new Error("FORTRESS_ROOT_OPERATION_EXPIRED");
  const count=this.approvals.get(request.operationId)?.size??0;
  if(count<this.requiredApprovals) throw new Error("FORTRESS_ROOT_QUORUM_REQUIRED");
 }
}

export class PostgresRootTrustQuorum {
 constructor(private readonly client:Client,private readonly requiredApprovals=2){}
 async approve(request:RootControlRequest,approverId:string,role:string,now=Date.now()):Promise<void>{
  if(request.expiresAt<=now||!approverId.trim()||!role.trim()) throw new Error("FORTRESS_ROOT_APPROVAL_INVALID");
  if(approverId===request.actorId) throw new Error("FORTRESS_ROOT_SEPARATION_OF_DUTIES");
  const hash=createHash("sha256").update([request.operationId,request.actorId,request.purpose,request.payloadHash,approverId,role].join("|")).digest("hex");
  await this.client.query(
   `INSERT INTO fortress_root_approvals(operation_id,approver_id,role,approved_at,approval_hash)
    VALUES($1,$2,$3,to_timestamp($4/1000.0),$5)
    ON CONFLICT(operation_id,approver_id) DO NOTHING`,
   [request.operationId,approverId,role,now,hash]
  );
 }
 async assertQuorum(request:RootControlRequest,now=Date.now()):Promise<void>{
  if(request.expiresAt<=now) throw new Error("FORTRESS_ROOT_OPERATION_EXPIRED");
  const result=await this.client.query(
   `SELECT count(*)::int AS count FROM fortress_root_approvals
    WHERE operation_id=$1 AND approved_at > now() - interval '10 minutes'`,
   [request.operationId]
  );
  if(Number(result.rows[0]?.count??0)<this.requiredApprovals) throw new Error("FORTRESS_ROOT_QUORUM_REQUIRED");
 }
}
