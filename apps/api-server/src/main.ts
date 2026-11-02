import { createServer as createHttpsServer } from "node:https";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg, { type Pool, type PoolClient, type QueryResultRow } from "pg";
import type { IncomingMessage, Server, RequestListener } from "node:http";
import { applyMigrations } from "../../../packages/finance/src/postgres-migrations.js";
import { DeviceTrustRepository } from "../../../packages/api-gateway/src/auth-device.js";
import { createSchoolApiServer } from "../../../packages/education/src/education-http.js";
import { PostgresEducationSyncStore, type PostgresTransactionClient } from "../../../packages/education/src/postgres-sync-fabric.js";
import { PostgresSchoolRealtimeStore } from "../../../packages/education/src/postgres-realtime-store.js";
import { SchoolRealtimeHub } from "../../../packages/education/src/school-realtime.js";
import type { Permission } from "../../../packages/security/src/policy.js";

const REQUIRED_ENV=["TPAY_DATABASE_URL","TPAY_TLS_KEY_FILE","TPAY_TLS_CERT_FILE"] as const;
const permissionSet=new Set<Permission>([
  "org.read","org.manage","member.manage","finance.read","finance.initiate",
  "finance.approve","ledger.read","ledger.post","audit.read","security.manage"
]);

function env(name:string):string{
  const value=process.env[name]?.trim();
  if(!value)throw new Error(`TPAY_ENV_REQUIRED:${name}`);
  return value;
}

export interface RuntimeConfig{
  databaseUrl:string;
  tlsKeyFile:string;
  tlsCertFile:string;
  host:string;
  port:number;
  webOrigins:readonly string[];
}

export function readRuntimeConfig(source=process.env):RuntimeConfig{
  for(const name of REQUIRED_ENV)if(!source[name]?.trim())throw new Error(`TPAY_ENV_REQUIRED:${name}`);
  const port=Number(source.TPAY_API_PORT??"8443");
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error("TPAY_API_PORT_INVALID");
  const webOrigins=(source.TPAY_WEB_ORIGINS??"").split(",").map(value=>value.trim()).filter(Boolean);
  for(const origin of webOrigins){
    let parsed:URL;
    try{parsed=new URL(origin);}catch{throw new Error("TPAY_WEB_ORIGIN_INVALID");}
    if(parsed.protocol!=="https:"||parsed.origin!==origin||parsed.username||parsed.password||parsed.pathname!=="/"||parsed.search||parsed.hash){
      throw new Error("TPAY_WEB_ORIGIN_HTTPS_REQUIRED");
    }
  }
  return {
    databaseUrl:source.TPAY_DATABASE_URL!.trim(),
    tlsKeyFile:source.TPAY_TLS_KEY_FILE!.trim(),
    tlsCertFile:source.TPAY_TLS_CERT_FILE!.trim(),
    host:source.TPAY_API_HOST?.trim()||"0.0.0.0",
    port,
    webOrigins
  };
}

class PooledTransactionClient implements PostgresTransactionClient{
  private client:PoolClient|undefined;
  constructor(private readonly pool:Pool){}
  async query<T extends QueryResultRow=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[];rowCount:number|null}>{
    if(!this.client)this.client=await this.pool.connect();
    try{
      const result=await this.client.query<T>(sql,values);
      const command=sql.trim().split(/\\s+/)[0]?.toUpperCase();
      if(command==="COMMIT"||command==="ROLLBACK"){this.client.release();this.client=undefined;}
      return {rows:result.rows,rowCount:result.rowCount};
    }catch(error){
      this.client?.release();
      this.client=undefined;
      throw error;
    }
  }
  release():void{this.client?.release();this.client=undefined;}
}

async function authenticateFactory(pool:Pool){
  const devices=new DeviceTrustRepository(pool);
  return async(request:IncomingMessage)=>{
    const header=String(request.headers.authorization??"");
    if(!header.startsWith("Bearer "))throw new Error("AUTH_BEARER_REQUIRED");
    const credential=header.slice(7).trim();
    if(!credential)throw new Error("AUTH_BEARER_REQUIRED");
    const validated=await devices.validateSession({sessionCredential:credential,now:new Date().toISOString()});
    if(!validated.valid||!validated.sessionId||!validated.actorId||!validated.organizationId||!validated.issuedAt||!validated.expiresAt){
      throw new Error("AUTH_SESSION_INVALID");
    }
    const actor=await pool.query(
      "SELECT tenant_id,organization_id,active FROM education_actors WHERE actor_id=$1 AND organization_id=$2 LIMIT 1",
      [validated.actorId,validated.organizationId]
    );
    const actorRow=actor.rows[0] as {tenant_id?:string;organization_id?:string;active?:boolean}|undefined;
    if(!actorRow?.active||!actorRow.tenant_id||actorRow.organization_id!==validated.organizationId)throw new Error("AUTH_ACTOR_INVALID");
    const permissions=await pool.query(
      "SELECT permission FROM api_actor_permissions WHERE tenant_id=$1 AND organization_id=$2 AND actor_id=$3",
      [actorRow.tenant_id,validated.organizationId,validated.actorId]
    );
    const granted=permissions.rows.map(row=>String((row as {permission:string}).permission)).filter((value):value is Permission=>permissionSet.has(value as Permission));
    if(granted.length===0)throw new Error("AUTH_PERMISSIONS_EMPTY");
    return {
      principal:{
        userId:validated.actorId,
        organizationId:validated.organizationId,
        permissions:granted,
        sessionId:validated.sessionId
      },
      tenantId:actorRow.tenant_id,
      session:{
        sessionId:validated.sessionId,
        userId:validated.actorId,
        organizationId:validated.organizationId,
        createdAt:Date.parse(validated.issuedAt),
        expiresAt:Date.parse(validated.expiresAt),
        assurance:"standard" as const
      }
    };
  };
}

export async function buildProductionApiServer(config:RuntimeConfig):Promise<{server:Server;pool:Pool}>{
  const tlsKey=await readFile(config.tlsKeyFile);
  const tlsCert=await readFile(config.tlsCertFile);
  const localInsecureDb=process.env.TPAY_ALLOW_INSECURE_LOCAL_DB==="true" && process.env.TPAY_ALLOW_LOCAL_TEST_SEED==="true";
  if(process.env.TPAY_DATABASE_SSL!=="require" && !localInsecureDb)throw new Error("TPAY_DATABASE_TLS_REQUIRED");
  const pool=new pg.Pool({
    connectionString:config.databaseUrl,
    max:20,
    ssl:process.env.TPAY_DATABASE_SSL==="require"?{rejectUnauthorized:true}:undefined
  });
  const migrationClient=await pool.connect();
  try{await applyMigrations(migrationClient, pathToFileURL(join(process.cwd(),"migrations")+"/"));}
  finally{migrationClient.release();}
  const authenticate=await authenticateFactory(pool);
  const realtime=new SchoolRealtimeHub(Number(process.env.TPAY_REALTIME_QUEUE_LIMIT??"100"));
  const server=createSchoolApiServer({
    db:pool,
    authenticate,
    syncClient:()=>new PooledTransactionClient(pool),
    mutationClient:()=>new PooledTransactionClient(pool),
    realtime,
    corsOrigins:config.webOrigins,
    realtimeStore:{
      append:async(event)=>{
        const client=new PooledTransactionClient(pool);
        try{return await new PostgresSchoolRealtimeStore(client).append(event);}
        finally{client.release();}
      },
      replay:async(tenantId:string,organizationId:string,afterSequence:bigint)=>{
        const client=new PooledTransactionClient(pool);
        try{return await new PostgresSchoolRealtimeStore(client).replay(tenantId,organizationId,afterSequence);}
        finally{client.release();}
      }
    }
  },{
    serverFactory:(handler:RequestListener)=>{
      const server=createHttpsServer({
        key:tlsKey,
        cert:tlsCert,
        minVersion:"TLSv1.3"
      },handler);
      server.requestTimeout=30000;
      server.headersTimeout=10000;
      server.keepAliveTimeout=5000;
      server.maxHeadersCount=100;
      server.maxRequestsPerSocket=100;
      return server;
    }
  });
  return {server,pool};
}


export async function startProductionApi():Promise<void>{
  const config=readRuntimeConfig();
  const {server,pool}=await buildProductionApiServer(config);
  const shutdown=async(signal:string)=>{
    server.close();
    await pool.end();
    process.exit(signal==="SIGINT"?130:143);
  };
  process.once("SIGINT",()=>void shutdown("SIGINT"));
  process.once("SIGTERM",()=>void shutdown("SIGTERM"));
  await new Promise<void>((resolve,reject)=>{
    server.once("error",reject);
    server.listen(config.port,config.host,()=>resolve());
  });
  console.log(`T.Pay API HTTPS listening on https://${config.host}:${config.port}`);
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  await startProductionApi();
}
