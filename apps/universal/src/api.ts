import { Platform } from "react-native";

export type Health = { ready:boolean; checks?:Array<{name:string;ok:boolean}> };
export type AuthResponse = { userId:string; csrfToken:string; expiresAt:string; sessionToken?:string };

export class TPayApi {
  private sessionToken:string|undefined;
  private csrfToken:string|undefined;
  constructor(private readonly baseUrl:string){
    if(!/^https:\/\//.test(baseUrl)) throw new Error("API_HTTPS_REQUIRED");
  }
  setSession(token:string|undefined,csrfToken?:string):void{
    this.sessionToken=token;
    if(csrfToken!==undefined)this.csrfToken=csrfToken;
  }
  clearSession():void{this.sessionToken=undefined;this.csrfToken=undefined;}
  getSessionToken():string|undefined{return this.sessionToken;}

  async health():Promise<Health>{
    const r=await fetch(this.baseUrl+"/v1/health",{headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error("API_HEALTH_"+r.status);
    const body=await r.json() as {data?:Health};
    return body.data ?? {ready:false};
  }

  async register(input:{loginIdentifier:string;displayName:string;password:string}):Promise<AuthResponse>{
    const result=await this.request<AuthResponse>("/v1/auth/register",{method:"POST",body:JSON.stringify(input)});
    this.setSession(result.sessionToken,result.csrfToken);
    return result;
  }

  async login(input:{loginIdentifier:string;password:string}):Promise<AuthResponse>{
    const result=await this.request<AuthResponse>("/v1/auth/login",{method:"POST",body:JSON.stringify(input)});
    this.setSession(result.sessionToken,result.csrfToken);
    return result;
  }

  async me():Promise<{userId:string;displayName:string}>{
    return this.request<{userId:string;displayName:string}>("/v1/auth/me");
  }

  async logout():Promise<void>{
    await this.request("/v1/auth/logout",{method:"POST"});
    this.clearSession();
  }

  private async request<T>(path:string,init:RequestInit={}):Promise<T>{
    const headers:Record<string,string>={"content-type":"application/json",Accept:"application/json"};
    if(init.headers)Object.assign(headers,init.headers);
    if(Platform.OS!=="web")headers["x-tpay-client"]="native";
    if(this.sessionToken&&Platform.OS!=="web")headers.Authorization=`Bearer ${this.sessionToken}`;
    if(Platform.OS==="web"&&this.csrfToken&&init.method&&init.method!=="GET")headers["x-csrf-token"]=this.csrfToken;
    const r=await fetch(this.baseUrl+path,{...init,credentials:"include",headers});
    const body=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(String((body as {error?:{message?:string}}).error?.message ?? "API_REQUEST_FAILED"));
    return (body as {data:T}).data;
  }
}
