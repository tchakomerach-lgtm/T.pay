import { randomUUID } from "node:crypto";
import { SecureHttpsAdapter } from "../../integrations/src/secure-http-adapter.js";
import type { AiGenerateRequest, AiGenerateResponse, AiProvider } from "./provider.js";

interface VendorConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly priority: number;
  readonly timeoutMs?: number;
}

function assertProviderEndpoint(endpoint:string, provider:"openai"|"anthropic"):string {
  let url:URL;
  try { url=new URL(endpoint); } catch { throw new Error("AI_PROVIDER_ENDPOINT_INVALID"); }
  const expected = provider==="openai"
    ? {origin:"https://api.openai.com",path:"/v1/responses"}
    : {origin:"https://api.anthropic.com",path:"/v1/messages"};
  const prefix=expected.path+"/";
  if(url.protocol!=="https:"||url.origin!==expected.origin||(url.pathname!==expected.path&&!url.pathname.startsWith(prefix))||url.username||url.password||url.hash) {
    throw new Error("AI_PROVIDER_ENDPOINT_NOT_ALLOWLISTED");
  }
  return url.toString();
}

async function postJson(adapter:SecureHttpsAdapter,endpoint:string,headers:Record<string,string>,body:unknown,signal?:AbortSignal):Promise<{requestId:string;body:Record<string,unknown>}> {
  const response=await adapter.request({url:endpoint,method:"POST",headers,body:new TextEncoder().encode(JSON.stringify(body)),idempotent:false,correlationId:randomUUID(),...(signal?{signal}:{})});
  if(response.state!=="CONFIRMED"||response.body===null) {
    if(response.status!==null) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
    throw new Error(signal?.aborted?"AI_PROVIDER_REQUEST_ABORTED":"AI_PROVIDER_TRANSPORT_UNKNOWN");
  }
  let parsed:unknown;
  try { parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(response.body)); } catch { throw new Error("AI_PROVIDER_RESPONSE_INVALID"); }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)) throw new Error("AI_PROVIDER_RESPONSE_INVALID");
  const record=parsed as Record<string,unknown>;
  return {requestId:typeof record.id==="string"?record.id:randomUUID(),body:record};
}

export class OpenAIResponsesProvider implements AiProvider {
  readonly id="openai" as const;
  readonly enabled=true;
  readonly priority:number;
  private readonly apiKey:string;
  private readonly model:string;
  private readonly endpoint:string;
  private readonly adapter:SecureHttpsAdapter;

  constructor(config:VendorConfig){
    if(!config.apiKey) throw new Error("AI_PROVIDER_SECRET_REQUIRED");
    this.apiKey=config.apiKey; this.model=config.model; this.priority=config.priority;
    this.endpoint=assertProviderEndpoint(config.endpoint ?? "https://api.openai.com/v1/responses","openai");
    this.adapter=new SecureHttpsAdapter([{origin:"https://api.openai.com",pathPrefix:"/v1/responses"}],undefined,undefined,Math.max(1000,Math.min(config.timeoutMs ?? 60000,120000)),1);
  }

  async generate(request:AiGenerateRequest,signal?:AbortSignal):Promise<AiGenerateResponse>{
    const result=await postJson(this.adapter,this.endpoint,{
      "content-type":"application/json",
      authorization:`Bearer ${this.apiKey}`,
    },{
      model:request.model || this.model,
      input:request.messages.map(m=>({role:m.role,content:m.content})),
      max_output_tokens:request.maxOutputTokens,
      ...(request.temperature === undefined ? {} : {temperature:request.temperature}),
      metadata:request.metadata,
    },signal);
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
  private readonly adapter:SecureHttpsAdapter;

  constructor(config:VendorConfig){
    if(!config.apiKey) throw new Error("AI_PROVIDER_SECRET_REQUIRED");
    this.apiKey=config.apiKey; this.model=config.model; this.priority=config.priority;
    this.endpoint=assertProviderEndpoint(config.endpoint ?? "https://api.anthropic.com/v1/messages","anthropic");
    this.adapter=new SecureHttpsAdapter([{origin:"https://api.anthropic.com",pathPrefix:"/v1/messages"}],undefined,undefined,Math.max(1000,Math.min(config.timeoutMs ?? 60000,120000)),1);
  }

  async generate(request:AiGenerateRequest,signal?:AbortSignal):Promise<AiGenerateResponse>{
    const system=request.messages.filter(m=>m.role==="system").map(m=>m.content).join("\n");
    const messages=request.messages.filter(m=>m.role!=="system").map(m=>({role:m.role,content:m.content}));
    const result=await postJson(this.adapter,this.endpoint,{
      "content-type":"application/json",
      "x-api-key":this.apiKey,
      "anthropic-version":"2023-06-01",
    },{
      model:request.model || this.model,
      max_tokens:request.maxOutputTokens,
      ...(system ? {system}:{ }),
      messages,
    },signal);
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
