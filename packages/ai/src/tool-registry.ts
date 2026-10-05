export type AiToolRisk = "low"|"medium"|"high"|"critical";

export interface AiToolContext {
  readonly organizationId: string;
  readonly actorId: string;
  readonly agentId: string;
  readonly approved: boolean;
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

export class AiToolRegistry {
  private readonly tools=new Map<string,AiToolDefinition>();
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
    if(context.capabilityExpiresAt!==undefined && context.capabilityExpiresAt<=Date.now()) throw new Error("AI_TOOL_CAPABILITY_EXPIRED");
    const approvalRequired=tool.requiresApproval || tool.risk==="high" || tool.risk==="critical";
    if(approvalRequired && !context.approved) throw new Error("AI_TOOL_APPROVAL_REQUIRED");
    if(approvalRequired && context.approvalPayloadHash!==undefined && context.requestedPayloadHash!==undefined && context.approvalPayloadHash!==context.requestedPayloadHash) throw new Error("AI_TOOL_APPROVAL_PAYLOAD_MISMATCH");
    if(approvalRequired && context.approvalPayloadHash===undefined) throw new Error("AI_TOOL_APPROVAL_BINDING_REQUIRED");
    return tool.execute(input,context);
  }
}
