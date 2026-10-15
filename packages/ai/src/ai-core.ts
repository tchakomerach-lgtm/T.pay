import { AiProviderRegistry, type AiGenerateRequest, type AiGenerateResponse } from "./provider.js";
import { AiToolRegistry } from "./tool-registry.js";
import { selectProviders, type AiRequestClassification, type AiRoutePolicy } from "./routing-policy.js";
import { sanitizeForExposure } from "../../security/src/fortress-exposure-guard.js";

const MAX_AI_EXPOSURE_BYTES=1_000_000;
function sanitizeAiRequest(request:AiGenerateRequest,purpose:string):AiGenerateRequest{
  const safe=sanitizeForExposure(request,{channel:"ai-context",purpose,allowedClasses:["internal"],maxBytes:MAX_AI_EXPOSURE_BYTES});
  return safe.value as AiGenerateRequest;
}
function sanitizeProviderResponse(response:AiGenerateResponse,purpose:string):AiGenerateResponse{
  const safe=sanitizeForExposure(response,{channel:"ai-context",purpose,allowedClasses:["internal"],maxBytes:MAX_AI_EXPOSURE_BYTES});
  return safe.value as AiGenerateResponse;
}
function sanitizeAgentOutput(output:AgentOutput):AgentOutput{
  const safe=sanitizeForExposure(output.result,{channel:"ai-context",purpose:"ai-agent-output",allowedClasses:["internal"],maxBytes:MAX_AI_EXPOSURE_BYTES});
  return {...output,result:String(safe.value)};
}

export interface SpecialistAgent {
  readonly id: string;
  readonly mission: string;
  readonly allowedTools: readonly string[];
  run(input: AgentInput, context: AgentContext): Promise<AgentOutput>;
}

export interface AgentInput {
  readonly objective: string;
  readonly context: readonly string[];
}

export interface AgentContext {
  readonly organizationId: string;
  readonly actorId: string;
  readonly requestId: string;
}

export interface AgentOutput {
  readonly agentId: string;
  readonly status: "completed"|"needs_approval"|"blocked";
  readonly result: string;
  readonly provider?: string;
  readonly model?: string;
}

export interface AiCorePolicy {
  readonly maxAgentHops: number;
  readonly allowedProviders: readonly string[];
  readonly defaultMaxOutputTokens: number;
}

export class AiCore {
  constructor(
    private readonly providers:AiProviderRegistry,
    private readonly tools:AiToolRegistry,
    private readonly agents:readonly SpecialistAgent[],
    private readonly policy:AiCorePolicy,
  ) {}

  async run(objective:string,context:AgentContext):Promise<readonly AgentOutput[]>{
    if(!objective.trim()) throw new Error("AI_OBJECTIVE_REQUIRED");
    if(this.policy.maxAgentHops<1 || this.policy.maxAgentHops>32) throw new Error("AI_AGENT_HOPS_INVALID");
    const safeObjective=String(sanitizeForExposure(objective,{channel:"ai-context",purpose:"ai-agent-objective",allowedClasses:["internal"],maxBytes:MAX_AI_EXPOSURE_BYTES}).value);
    const selected=this.agents.filter(a=>a.mission.length>0).slice(0,this.policy.maxAgentHops);
    const outputs:AgentOutput[]=[];
    for(const agent of selected){
      outputs.push(sanitizeAgentOutput(await agent.run({objective:safeObjective,context:[]},context)));
    }
    return outputs;
  }

  async generate(request:AiGenerateRequest):Promise<AiGenerateResponse>{
    const safeRequest=sanitizeAiRequest(request,"ai-provider-input");
    const providers=this.providers.list().filter(p=>this.policy.allowedProviders.includes(p.id));
    if(!providers.length) throw new Error("AI_NO_ALLOWED_PROVIDER");
    let lastError:unknown;
    for(const provider of providers){
      try{return sanitizeProviderResponse(await provider.generate(safeRequest),"ai-provider-output");}catch(error){lastError=error;}
    }
    throw lastError instanceof Error?lastError:new Error("AI_ALL_PROVIDERS_FAILED");
  }

  async generateRouted(request:AiGenerateRequest, classification:AiRequestClassification, routePolicy:AiRoutePolicy):Promise<AiGenerateResponse>{
    const safeRequest=sanitizeAiRequest(request,"ai-routed-provider-input");
    const routes=selectProviders(this.providers,routePolicy,classification);
    let lastError:unknown;
    for(const route of routes){
      try{return sanitizeProviderResponse(await route.provider.generate(safeRequest),"ai-routed-provider-output");}catch(error){lastError=error;}
    }
    throw lastError instanceof Error?lastError:new Error("AI_ROUTED_PROVIDERS_FAILED");
  }

  getToolRegistry():AiToolRegistry{return this.tools;}
}
