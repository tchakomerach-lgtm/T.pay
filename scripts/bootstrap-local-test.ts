import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { issueTenantBoundSessionCredential } from "../packages/api-gateway/src/auth-device.js";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { DeviceTrustRepository } from "../packages/api-gateway/src/auth-device.js";

if(process.env.TPAY_ALLOW_LOCAL_TEST_SEED!=="true")throw new Error("TPAY_LOCAL_TEST_SEED_DISABLED");

const databaseUrl=process.env.TPAY_DATABASE_URL;
if(!databaseUrl)throw new Error("TPAY_DATABASE_URL_REQUIRED");

const client=new pg.Client({connectionString:databaseUrl});
await client.connect();
try{
  await applyMigrations(client,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const organizationId=randomUUID();
  const actorId=randomUUID();
  const deviceCredential=randomBytes(24).toString("base64url");
  const sessionCredential=issueTenantBoundSessionCredential(organizationId,randomBytes(32).toString("base64url"));
  const now=new Date();
  const expiresAt=new Date(now.getTime()+24*60*60*1000);
  await client.query("INSERT INTO organizations(id,name,status,created_at) VALUES($1,$2,'active',$3)",[organizationId,"T.Pay Local Test",now.toISOString()]);
  await client.query("INSERT INTO education_actors(actor_id,tenant_id,organization_id,kind,active,data,version,updated_at) VALUES($1,$2,$3,'ADMIN',true,$4::jsonb,1,$5)",[actorId,organizationId,organizationId,JSON.stringify({display_name:"T.Pay Local Test"}),now.toISOString()]);
  await client.query("INSERT INTO api_actor_permissions(tenant_id,organization_id,actor_id,permission) VALUES($1,$2,$3,'org.read'),($1,$2,$3,'member.manage')",[organizationId,organizationId,actorId]);
  const devices=new DeviceTrustRepository(client);
  const deviceId=await devices.register({tenantId:organizationId,organizationId,actorId,deviceCredential,label:"local-test-device",sharedDevice:false,now:now.toISOString()});
  await devices.createSession({tenantId:organizationId,organizationId,actorId,deviceId,sessionCredential,trustEpoch:1,issuedAt:now.toISOString(),expiresAt:expiresAt.toISOString()});
  console.log(JSON.stringify({
    apiBaseUrl:`https://127.0.0.1:${process.env.TPAY_API_PORT??"8443"}`,
    organizationId,actorId,deviceId,
    accessToken:sessionCredential,
    expiresAt:expiresAt.toISOString()
  },null,2));
}finally{await client.end();}
