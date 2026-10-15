import {sanitizeForExposure} from "../../security/src/fortress-exposure-guard.js";
import type {AiGenerateRequest,AiGenerateResponse,AiProvider,AiProviderId} from "./provider.js";

export interface AiHttpProviderConfig {
  readonly id:AiProviderId;
  readonly endpoint:string;
  readonly apiKey:string;
  readonly priority:number;
  readonly requestTimeoutMs:number;
  readonly extraHeaders?:Readonly<Record<string,string>>;
}
const MAX_AI_PROVIDER_BYTES=1_000_000;
const MAX_AI_EXTRA_HEADER_BYTES=16*1024;
const FORBIDDEN_EXTRA_HEADERS=new Set(["authorization","content-type","host","content-length","connection","cookie","proxy-authorization","transfer-encoding"]);

function assertHttpsEndpoint(endpoint:string):URL{
  const url=new URL(endpoint);
  if(url.protocol!=="https:")throw new Error("AI_PROVIDER_ENDPOINT_MUST_USE_HTTPS");
  if(url.username||url.password||url.hash)throw new Error("AI_PROVIDER_ENDPOINT_CREDENTIALS_FORBIDDEN");
  return url;
}
function validateExtraHeaders(input:Readonly<Record<string,string>>={}):Readonly<Record<string,string>>{
  const output:Record<string,string>={};
  let total=0;
  for(const [rawName,value] of Object.entries(input)){
    const name=rawName.trim().toLowerCase();
    if(!/^[a-z0-9-]{1,100}$/.test(name))throw new Error("AI_PROVIDER_HEADER_NAME_INVALID");
    if(FORBIDDEN_EXTRA_HEADERS.has(name))throw new Error("AI_PROVIDER_HEADER_OVERRIDE_FORBIDDEN");
    if(/[\r\n]/.test(value))throw new Error("AI_PROVIDER_HEADER_NEWLINE_FORBIDDEN");
    total+=Buffer.byteLength(name)+Buffer.byteLength(value);
    if(total>MAX_AI_EXTRA_HEADER_BYTES)throw new Error("AI_PROVIDER_HEADERS_SIZE_LIMIT");
    output[name]=value;
  }
  return Object.freeze(output);
}
async function readBoundedText(response:Response,maxBytes=MAX_AI_PROVIDER_BYTES):Promise<string>{
  if(!response.body)return "";
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){
        await reader.cancel().catch(()=>undefined);
        throw new Error("AI_PROVIDER_RESPONSE_SIZE_LIMIT");
      }
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
}

export class HttpJsonAiProvider implements AiProvider{
  readonly enabled=true;
  readonly id:AiProviderId;
  readonly priority:number;
  private readonly endpoint:URL;
  private readonly apiKey:string;
  private readonly timeoutMs:number;
  private readonly extraHeaders:Readonly<Record<string,string>>;

  constructor(config:AiHttpProviderConfig){
    this.id=config.id;
    this.priority=config.priority;
    this.endpoint=assertHttpsEndpoint(config.endpoint);
    this.apiKey=config.apiKey.trim();
    const configuredTimeout=Number.isFinite(config.requestTimeoutMs)?config.requestTimeoutMs:30000;
    this.timeoutMs=Math.max(1000,Math.min(configuredTimeout,120000));
    this.extraHeaders=validateExtraHeaders(config.extraHeaders);
    if(!this.apiKey)throw new Error("AI_PROVIDER_SECRET_REQUIRED");
  }

  async generate(request:AiGenerateRequest,signal?:AbortSignal):Promise<AiGenerateResponse>{
    const safe=sanitizeForExposure(request,{
      channel:"ai-context",
      purpose:"ai-http-provider-input",
      allowedClasses:["internal"],
      maxBytes:MAX_AI_PROVIDER_BYTES
    });
    const safeRequest=safe.value as AiGenerateRequest;
    const controller=new AbortController();
    const abortFromCaller=()=>controller.abort();
    if(signal?.aborted)controller.abort();
    signal?.addEventListener("abort",abortFromCaller,{once:true});
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const response=await fetch(this.endpoint,{
        method:"POST",
        headers:{
          ...this.extraHeaders,
          "content-type":"application/json",
          authorization:`Bearer ${this.apiKey}`
        },
        body:JSON.stringify(safeRequest),
        signal:controller.signal,
        redirect:"error"
      });
      if(!response.ok)throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
      const text=await readBoundedText(response);
      let parsed:unknown;
      try{parsed=JSON.parse(text);}catch{throw new Error("AI_PROVIDER_RESPONSE_INVALID");}
      if(!parsed||typeof parsed!=="object")throw new Error("AI_PROVIDER_RESPONSE_INVALID");
      const record=parsed as Record<string,unknown>;
      const output=typeof record.output_text==="string"?record.output_text:typeof record.content==="string"?record.content:undefined;
      if(output===undefined)throw new Error("AI_PROVIDER_OUTPUT_MISSING");
      const requestId=typeof record.id==="string"?record.id:crypto.randomUUID();
      const result:AiGenerateResponse={provider:this.id,model:safeRequest.model,requestId,outputText:output};
      const sanitized=sanitizeForExposure(result,{
        channel:"ai-context",
        purpose:"ai-http-provider-output",
        allowedClasses:["internal"],
        maxBytes:MAX_AI_PROVIDER_BYTES
      });
      return sanitized.value as AiGenerateResponse;
    }finally{
      clearTimeout(timer);
      signal?.removeEventListener("abort",abortFromCaller);
    }
  }
}
