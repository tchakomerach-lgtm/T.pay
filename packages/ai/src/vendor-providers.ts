import type { AiGenerateRequest, AiGenerateResponse, AiProvider } from "./provider.js";

interface VendorConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly priority: number;
  readonly timeoutMs?: number;
}

async function postJson(endpoint: string, headers: Record<string,string>, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<{requestId:string; body: Record<string,unknown>}> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("AI_PROVIDER_ENDPOINT_MUST_USE_HTTPS");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(timeoutMs,120000)));
  if (signal?.aborted) controller.abort();
  try {
    const response=await fetch(url,{method:"POST",headers,body:JSON.stringify(body),signal:controller.signal});
    const text=await response.text();
    if(!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
    const parsed:unknown=JSON.parse(text);
    if(!parsed || typeof parsed!=="object") throw new Error("AI_PROVIDER_RESPONSE_INVALID");
    const record=parsed as Record<string,unknown>;
    return {requestId:typeof record.id==="string"?record.id:crypto.randomUUID(),body:record};
  } finally { clearTimeout(timer); }
}

export class OpenAIResponsesProvider implements AiProvider {
  readonly id="openai" as const;
  readonly enabled=true;
  readonly priority:number;
  private readonly apiKey:string;
  private readonly model:string;
  private readonly endpoint:string;
  private readonly timeoutMs:number;

  constructor(config:VendorConfig){
    if(!config.apiKey) throw new Error("AI_PROVIDER_SECRET_REQUIRED");
    this.apiKey=config.apiKey; this.model=config.model; this.priority=config.priority;
    this.endpoint=config.endpoint ?? "https://api.openai.com/v1/responses";
    this.timeoutMs=config.timeoutMs ?? 60000;
  }

  async generate(request:AiGenerateRequest,signal?:AbortSignal):Promise<AiGenerateResponse>{
    const result=await postJson(this.endpoint,{
      "content-type":"application/json",
      authorization:`Bearer ${this.apiKey}`,
    },{
      model:request.model || this.model,
      input:request.messages.map(m=>({role:m.role,content:m.content})),
      max_output_tokens:request.maxOutputTokens,
      ...(request.temperature === undefined ? {} : {temperature:request.temperature}),
      metadata:request.metadata,
    },this.timeoutMs,signal);
    const output=typeof result.body.output_text==="string"?result.body.output_text:extractOpenAIOutput(result.body.output);
    if(typeof output !== "string" || output.length===0) throw new Error("AI_OPENAI_OUTPUT_MISSING");
    return {provider:this.id,model:request.model || this.model,requestId:result.requestId,outputText:output};
  }
}

function extractOpenAIOutput(value:unknown):string|undefined{
  if(!Array.isArray(value)) return undefined;
  const parts:string[]=[];
  for(const item of value){
    if(!item || typeof item!=="object") continue;
    const content=(item as Record<string,unknown>).content;
    if(!Array.isArray(content)) continue;
    for(const part of content){
      if(part && typeof part==="object"){
        const textValue=(part as Record<string,unknown>).text;
        if(typeof textValue==="string") parts.push(textValue);
      }
    }
  }
  return parts.join("");
}

export class AnthropicMessagesProvider implements AiProvider {
  readonly id="anthropic" as const;
  readonly enabled=true;
  readonly priority:number;
  private readonly apiKey:string;
  private readonly model:string;
  private readonly endpoint:string;
  private readonly timeoutMs:number;

  constructor(config:VendorConfig){
    if(!config.apiKey) throw new Error("AI_PROVIDER_SECRET_REQUIRED");
    this.apiKey=config.apiKey; this.model=config.model; this.priority=config.priority;
    this.endpoint=config.endpoint ?? "https://api.anthropic.com/v1/messages";
    this.timeoutMs=config.timeoutMs ?? 60000;
  }

  async generate(request:AiGenerateRequest,signal?:AbortSignal):Promise<AiGenerateResponse>{
    const system=request.messages.filter(m=>m.role==="system").map(m=>m.content).join("\n");
    const messages=request.messages.filter(m=>m.role!=="system").map(m=>({role:m.role,content:m.content}));
    const result=await postJson(this.endpoint,{
      "content-type":"application/json",
      "x-api-key":this.apiKey,
      "anthropic-version":"2023-06-01",
    },{
      model:request.model || this.model,
      max_tokens:request.maxOutputTokens,
      ...(system ? {system}:{ }),
      messages,
    },this.timeoutMs,signal);
    const output=extractAnthropicOutput(result.body.content);
    if(typeof output !== "string" || output.length===0) throw new Error("AI_ANTHROPIC_OUTPUT_MISSING");
    return {provider:this.id,model:request.model || this.model,requestId:result.requestId,outputText:output};
  }
}

function extractAnthropicOutput(value:unknown):string|undefined{
  if(!Array.isArray(value)) return undefined;
  const parts:string[]=[];
  for(const item of value){
    if(item && typeof item==="object"){
      const textValue=(item as Record<string,unknown>).text;
      if(typeof textValue==="string") parts.push(textValue);
    }
  }
  return parts.join("");
}
