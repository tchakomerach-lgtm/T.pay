import type {PoolClient} from "pg";
import type {AiAgentRole,AiRisk} from "./contracts.js";
import type {AiToolSandboxPolicy} from "./tool-sandbox.js";

export class PostgresAiToolPolicyRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async upsert(policy:AiToolSandboxPolicy):Promise<void>{
    await this.db.query(
      "INSERT INTO ai_tool_policies (organization_id,tool_name,enabled,allowed_agent_roles,max_risk,requires_human_approval,version,updated_at) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,now()) ON CONFLICT (organization_id,tool_name) DO UPDATE SET enabled=EXCLUDED.enabled,allowed_agent_roles=EXCLUDED.allowed_agent_roles,max_risk=EXCLUDED.max_risk,requires_human_approval=EXCLUDED.requires_human_approval,version=EXCLUDED.version,updated_at=now()",
      [policy.organizationId,policy.toolName,policy.enabled,JSON.stringify(policy.allowedAgentRoles),policy.maxRisk,policy.requiresHumanApproval,policy.version]
    );
  }
  async find(organizationId:string,toolName:string):Promise<AiToolSandboxPolicy|undefined>{
    const result=await this.db.query(
      "SELECT organization_id,tool_name,enabled,allowed_agent_roles,max_risk,requires_human_approval,version FROM ai_tool_policies WHERE organization_id=$1 AND tool_name=$2",
      [organizationId,toolName]
    );
    const row=result.rows[0]; if(!row)return undefined;
    return {organizationId:row.organization_id,toolName:row.tool_name,enabled:row.enabled,allowedAgentRoles:(Array.isArray(row.allowed_agent_roles)?row.allowed_agent_roles:[]) as AiAgentRole[],maxRisk:row.max_risk as AiRisk,requiresHumanApproval:row.requires_human_approval,version:Number(row.version)};
  }
}
