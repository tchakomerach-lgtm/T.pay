import type {PoolClient} from "pg";
import type {AiProvider} from "./model-router.js";

export interface AiProviderObservation {
  id:string; organizationId?:string; requestId:string; provider:AiProvider; model:string;
  status:"succeeded"|"failed"|"blocked"; latencyMs:number; attempts:number;
  inputTokens:number; outputTokens:number; estimatedCostMinor:bigint; errorClass?:string; createdAt:string;
}
export class PostgresAiObservabilityRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async record(o:AiProviderObservation):Promise<void>{
    if(o.latencyMs<0||o.attempts<0||o.inputTokens<0||o.outputTokens<0||o.estimatedCostMinor<0n) throw new Error("AI_OBSERVATION_INVALID");
    await this.db.query(
      "INSERT INTO ai_provider_observations (id,organization_id,request_id,provider,model,status,latency_ms,attempts,input_tokens,output_tokens,estimated_cost_minor,error_class,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::timestamptz)",
      [o.id,o.organizationId??null,o.requestId,o.provider,o.model,o.status,o.latencyMs,o.attempts,o.inputTokens,o.outputTokens,o.estimatedCostMinor.toString(),o.errorClass??null,o.createdAt]
    );
  }
}
