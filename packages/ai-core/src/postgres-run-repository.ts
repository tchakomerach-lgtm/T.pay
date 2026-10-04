import type { PoolClient } from "pg";
import type { AiRequest, AiDecision } from "./contracts.js";

export interface PersistedAiRun {
  id:string; organizationId?:string; userId:string; agentId?:string;
  modelProvider:string; modelName:string; policyVersion:string;
  action:AiDecision["action"]; risk:string; inputHash:string; outputHash?:string; createdAt:string;
}

export class PostgresAiRunRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async appendRun(run:PersistedAiRun):Promise<void>{
    await this.db.query(
      "INSERT INTO ai_runs (id,organization_id,user_id,agent_id,model_provider,model_name,policy_version,action,risk,input_hash,output_hash,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::timestamptz)",
      [run.id,run.organizationId??null,run.userId,run.agentId??null,run.modelProvider,run.modelName,run.policyVersion,run.action,run.risk,run.inputHash,run.outputHash??null,run.createdAt]
    );
  }
  async findRun(id:string):Promise<PersistedAiRun|undefined>{
    const result=await this.db.query("SELECT id,organization_id,user_id,agent_id,model_provider,model_name,policy_version,action,risk,input_hash,output_hash,created_at FROM ai_runs WHERE id=$1",[id]);
    const r=result.rows[0]; if(!r) return undefined;
    return {id:r.id,organizationId:r.organization_id??undefined,userId:r.user_id,agentId:r.agent_id??undefined,modelProvider:r.model_provider,modelName:r.model_name,policyVersion:r.policy_version,action:r.action,risk:r.risk,inputHash:r.input_hash,outputHash:r.output_hash??undefined,createdAt:new Date(r.created_at).toISOString()};
  }
}
