import type {PoolClient} from "pg";
export type ToolExecutionStatus="reserved"|"running"|"succeeded"|"failed"|"quarantined";
export interface ToolExecution {id:string;organizationId:string;executionKey:string;toolName:string;risk:"low"|"medium"|"high"|"critical";status:ToolExecutionStatus;inputHash:string;outputHash?:string;createdAt:string;completedAt?:string;}
export class PostgresAiToolExecutionRepository{
 constructor(private readonly db:Pick<PoolClient,"query">){}
 async reserve(e:ToolExecution):Promise<boolean>{
   const r=await this.db.query("INSERT INTO ai_tool_executions (id,organization_id,execution_key,tool_name,risk,status,input_hash,created_at) VALUES ($1,$2,$3,$4,$5,'reserved',$6,$7::timestamptz) ON CONFLICT (organization_id,execution_key) DO NOTHING",[e.id,e.organizationId,e.executionKey,e.toolName,e.risk,e.inputHash,e.createdAt]);
   return Number(r.rowCount??0)===1;
 }
 async complete(organizationId:string,executionKey:string,status:Extract<ToolExecutionStatus,"succeeded"|"failed"|"quarantined">,outputHash:string|undefined,completedAt:string):Promise<boolean>{
   const r=await this.db.query("UPDATE ai_tool_executions SET status=$3,output_hash=$4,completed_at=$5::timestamptz WHERE organization_id=$1 AND execution_key=$2 AND status IN ('reserved','running')",[organizationId,executionKey,status,outputHash??null,completedAt]);
   return Number(r.rowCount??0)===1;
 }
}
