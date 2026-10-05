export type AiToolRisk = "low"|"medium"|"high"|"critical";

export interface AiToolContext {
  readonly organizationId: string;
  readonly actorId: string;
  readonly agentId: string;
  readonly approved: boolean;
}

export interface AiToolDefinition<Input=unknown,Output=unknown> {
  readonly name: string;
  readonly version: string;
  readonly risk: AiToolRisk;
  readonly requiresApproval: boolean;
  readonly allowedAgents: readonly string[];
  readonly execute: (input: Input, context: AiToolContext) => Promise<Output>;
}

export class AiToolRegistry {
  private readonly tools=new Map<string,AiToolDefinition>();
  register(tool:AiToolDefinition):void{
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
    if(tool.requiresApproval && !context.approved) throw new Error("AI_TOOL_APPROVAL_REQUIRED");
    return tool.execute(input,context);
  }
}
