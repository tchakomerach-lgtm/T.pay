import {isIP} from "node:net";

const MAX_RESPONSE_BYTES=256*1024;

function isPrivateIp(hostname:string):boolean{
  const version=isIP(hostname);
  if(version===4){
    const parts=hostname.split(".").map(Number);
    const a=parts[0]??-1,b=parts[1]??-1;
    return a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
  }
  if(version===6){
    const h=hostname.toLowerCase();
    return h==="::1"||h.startsWith("fc")||h.startsWith("fd")||h.startsWith("fe8")||h.startsWith("fe9")||h.startsWith("fea")||h.startsWith("feb");
  }
  return false;
}

export function assertHttpsEndpoint(endpoint:string,allowedHosts:readonly string[]):URL{
  let url:URL;
  try{url=new URL(endpoint);}catch{throw new Error("HTTPS_ENDPOINT_INVALID");}
  if(url.protocol!=="https:")throw new Error("HTTPS_REQUIRED");
  if(url.username||url.password)throw new Error("HTTPS_CREDENTIALS_IN_URL");
  if(url.hash)throw new Error("HTTPS_FRAGMENT_FORBIDDEN");
  if(isPrivateIp(url.hostname))throw new Error("HTTPS_PRIVATE_IP_FORBIDDEN");
  if(!allowedHosts.includes(url.hostname.toLowerCase()))throw new Error("HTTPS_HOST_NOT_ALLOWLISTED");
  return url;
}

export async function requestJson<T>(input:{
  endpoint:string;
  allowedHosts:readonly string[];
  method:"GET"|"POST"|"PUT"|"PATCH"|"DELETE";
  headers?:Record<string,string>;
  body?:unknown;
  timeoutMs?:number;
  maxResponseBytes?:number;
}):Promise<{status:number;data:T}>{
  const url=assertHttpsEndpoint(input.endpoint,input.allowedHosts);
  const timeoutMs=input.timeoutMs??10000;
  const maxResponseBytes=input.maxResponseBytes??MAX_RESPONSE_BYTES;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error("HTTPS_TIMEOUT_INVALID");
  if(!Number.isInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>MAX_RESPONSE_BYTES)throw new Error("HTTPS_RESPONSE_LIMIT_INVALID");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(new Error("TIMEOUT")),timeoutMs);
  try{
    const requestInit:RequestInit={
      method:input.method,
      headers:{"accept":"application/json","content-type":"application/json",...(input.headers??{})},
      redirect:"error",
      signal:controller.signal
    };
    if(input.body!==undefined)requestInit.body=JSON.stringify(input.body);
    const response=await fetch(url,requestInit);
    const length=response.headers.get("content-length");
    if(length!==null&&Number(length)>maxResponseBytes)throw new Error("HTTPS_RESPONSE_TOO_LARGE");
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength>maxResponseBytes)throw new Error("HTTPS_RESPONSE_TOO_LARGE");
    if(!response.ok)throw new Error("HTTPS_UPSTREAM_STATUS_"+response.status);
    let data:T;
    try{data=JSON.parse(new TextDecoder().decode(bytes)) as T;}catch{throw new Error("HTTPS_RESPONSE_JSON_INVALID");}
    return {status:response.status,data};
  }catch(error){
    if(error instanceof Error&&error.name==="AbortError")throw new Error("HTTPS_TIMEOUT");
    throw error;
  }finally{clearTimeout(timer);}
}
