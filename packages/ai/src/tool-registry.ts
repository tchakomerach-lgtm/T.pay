import { createActionEnvelope, type AiActionRisk } from "./action-envelope.js";
import type { AiCapability } from "./capability-policy.js";
import { AiPolicyGate } from "./policy-gate.js";

export type AiToolRisk = "low"|"medium"|"high"|"critical";

export interface AiToolContext {
  readonly organizationId: string;
  readonly actorId: string;
  readonly agentId: string;
  readonly approved: boolean;
  readonly purpose?: string;
  readonly correlationId?: string;
  readonly capability?: AiCapability;
  readonly approvalPayloadHash?: string;
  readonly requestedPayloadHash?: string;
  readonly capabilityExpiresAt?: number;
}

export interface AiToolDefinition<Input=unknown,Output=unknown> {
  readonly name: string;
  readonly version: string;
  readonly risk: AiToolRisk;
  readonly requiresApproval: boolean;
  readonly allowedAgents: readonly string[];
  readonly execute: (input: Input, context: AiToolContext) => Promise<Output>;
}

function validateDefinition(tool:AiToolDefinition):void{
  if(!tool.name.trim() || !tool.version.trim()) throw new Error("AI_TOOL_ID_INVALID");
  if(tool.allowedAgents.length===0) throw new Error("AI_TOOL_AGENTS_REQUIRED");
  if(tool.risk==="critical" && !tool.requiresApproval) throw new Error("AI_CRITICAL_TOOL_APPROVAL_REQUIRED");
}

function actionRisk(risk:AiToolRisk):AiActionRisk {
  if(risk==="low") return "L0";
  if(risk==="medium") return "L2";
  if(risk==="high") return "L4";
  return "L5";
}

export class AiToolRegistry {
  private readonly tools=new Map<string,AiToolDefinition>();
  private readonly policyGate=new AiPolicyGate();

  register(tool:AiToolDefinition):void{
    validateDefinition(tool);
    if(this.tools.has(tool.name)) throw new Error("AI_TOOL_ALREADY_REGISTERED");
    this.tools.set(tool.name,tool);
  }

  get(name:string,agentId:string):AiToolDefinition{
    const tool=this.tools.get(name);
    if(!tool) throw new Error("AI_TOOL_NOT_FOUND");
    if(!tool.allowedAgents.includes(agentId)) throw new Error("AI_TOOL_AGENT_NOT_ALLOWED");
    return tool;
  }

  async execute(name:string,input:unknown,context:AiToolContext):Promise<unknown>{
    const tool=this.get(name,context.agentId);
    if(!context.organizationId.trim() || !context.actorId.trim() || !context.agentId.trim()) throw new Error("AI_TOOL_CONTEXT_REQUIRED");
    const now=Date.now();
    if(context.capabilityExpiresAt!==undefined && context.capabilityExpiresAt<=now) throw new Error("AI_TOOL_CAPABILITY_EXPIRED");
    const risk=actionRisk(tool.risk);
    if(risk!=="L0" && (!context.purpose?.trim() || !context.correlationId?.trim())) throw new Error("AI_TOOL_ACTION_CONTEXT_REQUIRED");
    const canonicalPayload=JSON.stringify(input);
    const action=createActionEnvelope({
      actionId: context.correlationId ?? `${name}-${now}`,
      toolName: name,
      toolVersion: tool.version,
      organizationId: context.organizationId,
      actorId: context.actorId,
      agentId: context.agentId,
      purpose: context.purpose ?? "low-risk-read",
      risk,
      canonicalPayload,
      createdAt: now,
      expiresAt: context.capabilityExpiresAt ?? now+30_000,
      correlationId: context.correlationId ?? `${name}-${now}`,
    });
    const approvalRequired=tool.requiresApproval || risk==="L4" || risk==="L5";
    if(approvalRequired && !context.approved) throw new Error("AI_TOOL_APPROVAL_REQUIRED");
    if(approvalRequired && context.approvalPayloadHash!==undefined && context.approvalPayloadHash!==action.payloadHash) throw new Error("AI_TOOL_APPROVAL_PAYLOAD_MISMATCH");
    if(approvalRequired && context.approvalPayloadHash===undefined) throw new Error("AI_TOOL_APPROVAL_BINDING_REQUIRED");
    this.policyGate.assertAllowed(action,context.capability,context.approved);
    return tool.execute(input,context);
  }

  disableAll(reason:string):void { this.policyGate.disable(reason); }
  enableAll():void { this.policyGate.enable(); }
  isEnabled():boolean { return this.policyGate.isEnabled(); }
}
