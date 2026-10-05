import type {Client} from "pg";

export interface TenantSecurityContext{
 readonly organizationId:string;
 readonly actorId:string;
}

function assertContext(context:TenantSecurityContext):void{
 if(!context.organizationId.trim()||!context.actorId.trim())throw new Error("TENANT_SECURITY_CONTEXT_REQUIRED");
}

export async function withTenantSecurityContext<T>(
 client:Client,
 context:TenantSecurityContext,
 work:(client:Client)=>Promise<T>
):Promise<T>{
 assertContext(context);
 await client.query("BEGIN");
 try{
  await client.query("SELECT set_config('tpay.organization_id',$1,true)",[context.organizationId]);
  await client.query("SELECT set_config('tpay.actor_id',$1,true)",[context.actorId]);
  const result=await work(client);
  await client.query("COMMIT");
  return result;
 }catch(error){
  await client.query("ROLLBACK");
  throw error;
 }
}
