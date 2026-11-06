import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { createSchoolApiServer } from "../packages/education/src/education-http.js";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;

test("P056.3.1 permission grant lifecycle is authenticated, step-up protected and tenant scoped", {skip:!databaseUrl&&"TPAY_DATABASE_URL is not configured"}, async()=>{
 const pool=new pg.Pool({connectionString:databaseUrl});
 const tenantId="p05631-"+randomUUID();
 const organizationId=randomUUID();
 const otherOrganizationId=randomUUID();
 const grantorId=randomUUID();
 const targetActorId=randomUUID();
 const foreignActorId=randomUUID();
 let server:ReturnType<typeof createSchoolApiServer>|undefined;
 let port=0;
 let assurance:"standard"|"step_up"="step_up";
 let permissions:("security.manage"|"org.read")[]=["security.manage"];
 try{
  const migrationClient=await pool.connect();
  try{await applyMigrations(migrationClient,pathToFileURL(join(process.cwd(),"migrations")+"/"));}
  finally{migrationClient.release();}
  await pool.query(
   "INSERT INTO education_actors(actor_id,tenant_id,organization_id,kind,active,data,version,updated_at) VALUES($1,$2,$3,'ADMIN',true,'{}'::jsonb,1,now()),($4,$2,$5,'ADMIN',true,'{}'::jsonb,1,now())",
   [targetActorId,tenantId,organizationId,foreignActorId,otherOrganizationId]
  );
  const auth=()=>({
   principal:{userId:grantorId,organizationId,permissions,sessionId:grantorId},
   tenantId,
   session:{sessionId:grantorId,userId:grantorId,organizationId,createdAt:Date.now()-1000,expiresAt:Date.now()+60000,assurance}
  });
  server=createSchoolApiServer({
   db:pool as any,
   authenticate:async()=>auth(),
   syncClient:()=>({query:async()=>({rows:[],rowCount:0})}) as any,
   mutationClient:()=>pool.connect() as any
  });
  await new Promise<void>(resolve=>server!.listen(0,"127.0.0.1",resolve));
  port=(server.address() as any).port;
  const base=`http://127.0.0.1:${port}/v1/education/permission-grants`;
  assurance="standard";
  const noStepUp=await fetch(base,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"grant-no-stepup-"+randomUUID()},body:JSON.stringify({actorId:targetActorId,permission:"org.read",reason:"Must require step-up"})});
  assert.equal(noStepUp.status,403);
  assurance="step_up";
  permissions=["org.read"];
  const noSecurityPermission=await fetch(base,{method:"POST",headers:{"content-type":"application/json","x-idempotency-key":"grant-no-security-"+randomUUID()},body:JSON.stringify({actorId:targetActorId,permission:"org.read",reason:"Must require security.manage"})});
  assert.equal(noSecurityPermission.status,403);
  permissions=["security.manage"];
  const post=await fetch(base,{
   method:"POST",
   headers:{"content-type":"application/json","x-idempotency-key":"grant-create-"+randomUUID()},
   body:JSON.stringify({actorId:targetActorId,permission:"org.read",reason:"Temporary school read access",validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()})
  });
  const created=await post.json() as any;
  assert.equal(post.status,200,JSON.stringify(created));
  assert.equal(created.data.actor_id,targetActorId);
  assert.equal(created.data.permission,"org.read");
  const grantId=created.data.grant_id as string;

  const list=await fetch(base+`?actorId=${targetActorId}`);
  const listed=await list.json() as any;
  assert.equal(list.status,200,JSON.stringify(listed));
  assert.equal(listed.data.length,1);
  assert.equal(listed.data[0].grant_id,grantId);

  const foreign=await fetch(base,{
   method:"POST",
   headers:{"content-type":"application/json","x-idempotency-key":"grant-foreign-"+randomUUID()},
   body:JSON.stringify({actorId:foreignActorId,permission:"org.manage",reason:"Cross-org attempt"})
  });
  assert.equal(foreign.status,404);

  const revoke=await fetch(base+"/"+grantId,{
   method:"PATCH",
   headers:{"content-type":"application/json","x-idempotency-key":"grant-revoke-"+randomUUID()},
   body:JSON.stringify({reason:"Temporary assignment ended"})
  });
  const revoked=await revoke.json() as any;
  assert.equal(revoke.status,200,JSON.stringify(revoked));
  assert.equal(revoked.data.revoked_by,grantorId);
  assert.equal(revoked.data.revocation_reason,"Temporary assignment ended");

  const duplicateRevoke=await fetch(base+"/"+grantId,{
   method:"PATCH",
   headers:{"content-type":"application/json","x-idempotency-key":"grant-revoke-again-"+randomUUID()},
   body:JSON.stringify({reason:"Duplicate revocation"})
  });
  assert.equal(duplicateRevoke.status,409);

  const history=await pool.query(
   "SELECT revoked_at,revoked_by,revocation_reason FROM api_actor_permissions WHERE tenant_id=$1 AND organization_id=$2 AND grant_id=$3::uuid",
   [tenantId,organizationId,grantId]
  );
  assert.equal(history.rows.length,1);
  assert.ok(history.rows[0].revoked_at);
  assert.equal(history.rows[0].revoked_by,grantorId);
  assert.equal(history.rows[0].revocation_reason,"Temporary assignment ended");
 }finally{
  if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  await pool.query("DELETE FROM api_actor_permissions WHERE tenant_id=$1 AND organization_id=$2",[tenantId,organizationId]).catch(()=>undefined);
  await pool.query("DELETE FROM api_request_audit WHERE organization_id=$1",[organizationId]).catch(()=>undefined);
  await pool.query("DELETE FROM api_request_deduplication WHERE organization_id=$1",[organizationId]).catch(()=>undefined);
  await pool.query("DELETE FROM education_actors WHERE tenant_id=$1 AND (organization_id=$2 OR organization_id=$3)",[tenantId,organizationId,otherOrganizationId]).catch(()=>undefined);
  await pool.end();
 }
});

