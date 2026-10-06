export type Health = { ready:boolean; checks?:Array<{name:string;ok:boolean}> };
export type AuthResponse = { userId:string; csrfToken:string; expiresAt:string };

export class TPayApi {
  constructor(private readonly baseUrl:string){ if(!/^https:\/\//.test(baseUrl)) throw new Error("API_HTTPS_REQUIRED"); }

  async health():Promise<Health>{
    const r=await fetch(this.baseUrl+"/v1/health",{headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error("API_HEALTH_"+r.status);
    const body=await r.json() as {data?:Health};
    return body.data ?? {ready:false};
  }

  async register(input:{loginIdentifier:string;displayName:string;password:string}):Promise<AuthResponse>{
    return this.request<AuthResponse>("/v1/auth/register",{method:"POST",body:JSON.stringify(input)});
  }

  async login(input:{loginIdentifier:string;password:string}):Promise<AuthResponse>{
    return this.request<AuthResponse>("/v1/auth/login",{method:"POST",body:JSON.stringify(input)});
  }

  async me():Promise<{userId:string;displayName:string}>{
    return this.request<{userId:string;displayName:string}>("/v1/auth/me");
  }

  async logout():Promise<void>{
    await this.request("/v1/auth/logout",{method:"POST"});
  }

  private async request<T>(path:string,init:RequestInit={}):Promise<T>{
    const r=await fetch(this.baseUrl+path,{...init,credentials:"include",headers:{"content-type":"application/json",Accept:"application/json",...(init.headers??{})}});
    const body=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(String((body as {error?:{message?:string}}).error?.message ?? "API_REQUEST_FAILED"));
    return (body as {data:T}).data;
  }
}