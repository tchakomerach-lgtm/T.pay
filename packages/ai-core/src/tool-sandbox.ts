import type {AiAgentRole,AiRisk,AiTool} from "./contracts.js";

const RISK_ORDER:Record<AiRisk,number>={low:1,medium:2,high:3,critical:4};

export interface AiToolSandboxPolicy {
  organizationId:string;
  toolName:string;
  enabled:boolean;
  allowedAgentRoles:AiAgentRole[];
  maxRisk:AiRisk;
  requiresHumanApproval:boolean;
  version:number;
}

export function authorizeSandboxTool(
  organizationId:string,
  agentRole:AiAgentRole,
  tool:AiTool,
  policy:AiToolSandboxPolicy
):void {
  if(policy.organizationId!==organizationId||policy.toolName!==tool.name) throw new Error("AI_TOOL_TENANT_MISMATCH");
  if(!policy.enabled) throw new Error("AI_TOOL_DISABLED");
  if(!policy.allowedAgentRoles.includes(agentRole)) throw new Error("AI_TOOL_ROLE_FORBIDDEN");
  if(RISK_ORDER[tool.risk]>RISK_ORDER[policy.maxRisk]) throw new Error("AI_TOOL_RISK_EXCEEDS_POLICY");
  if(tool.requiresHumanApproval&&!policy.requiresHumanApproval) throw new Error("AI_TOOL_APPROVAL_POLICY_WEAK");
  if(tool.name.startsWith("ledger.")||tool.name.startsWith("payment.")||tool.name.startsWith("credit.")) throw new Error("AI_DIRECT_FINANCIAL_MUTATION_FORBIDDEN");
}
