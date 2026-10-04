import {createHash} from "node:crypto";
export interface AiBudget {maxRequests:number;maxInputTokens:number;maxOutputTokens:number;maxEstimatedCostMinor:bigint;}
export interface AiUsage {requests:number;inputTokens:number;outputTokens:number;estimatedCostMinor:bigint;}
export function hashAiPayload(value:string):string{return createHash("sha256").update(value,"utf8").digest("hex");}
export function assertWithinBudget(usage:AiUsage,budget:AiBudget):void{
  if(usage.requests>budget.maxRequests)throw new Error("AI_RATE_LIMIT_REQUESTS");
  if(usage.inputTokens>budget.maxInputTokens)throw new Error("AI_RATE_LIMIT_INPUT_TOKENS");
  if(usage.outputTokens>budget.maxOutputTokens)throw new Error("AI_RATE_LIMIT_OUTPUT_TOKENS");
  if(usage.estimatedCostMinor>budget.maxEstimatedCostMinor)throw new Error("AI_BUDGET_EXCEEDED");
}
export function normalizeExecutionKey(key:string):string{
  const normalized=key.trim();
  if(normalized.length<16||normalized.length>256)throw new Error("AI_IDEMPOTENCY_KEY_INVALID");
  return normalized;
}
