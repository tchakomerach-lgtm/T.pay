import type { AiCore, AgentContext, AgentInput, AgentOutput, SpecialistAgent } from "./ai-core.js";

export class CommercialGrowthAgent implements SpecialistAgent {
  readonly id="commercial-growth";
  readonly mission="discover qualified revenue opportunities and prepare policy-compliant commercial actions";
  readonly allowedTools=readonlyTools(["discover_lead","qualify_lead","prepare_follow_up","publish_offer"]);

  constructor(private readonly core:AiCore, private readonly model:string){}

  async run(input:AgentInput,context:AgentContext):Promise<AgentOutput>{
    const response=await this.core.generate({
      model:this.model,
      messages:[
        {role:"system",content:"You are T.Pay Commercial Growth Agent. Produce only a concise, auditable action plan. Never invent a customer identity, consent, price approval or financial transaction. Respect organization scope and direct-contact consent."},
        {role:"user",content:input.objective},
      ],
      maxOutputTokens:700,
      metadata:{organizationId:context.organizationId,agentId:this.id,requestId:context.requestId},
    });
    return {agentId:this.id,status:"completed",result:response.outputText,provider:response.provider,model:response.model};
  }
}
function readonlyTools(values: string[]): readonly string[]{return values;}
