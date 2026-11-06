import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import pg from "pg";
import {applyMigrations} from "../packages/finance/src/postgres-migrations.js";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {issueTenantBoundSessionCredential} from "../packages/api-gateway/src/auth-device.js";

const adminUrl=process.env.TPAY_DATABASE_URL;
const runtimeUrl=process.env.TPAY_RUNTIME_DATABASE_URL;

test("P057.2 live PostgreSQL runtime login is NOBYPASSRLS and cannot cross tenant session/device boundaries",{
 skip:(!adminUrl||!runtimeUrl)&&"TPAY_DATABASE_URL and TPAY_RUNTIME_DATABASE_URL are required"
},async()=>{
 const admin=new pg.Client({connectionString:adminUrl});
 const runtime=new pg.Client({connectionString:runtimeUrl});
 const tenantA="p0572-a-"+randomUUID(),tenantB="p0572-b-"+randomUUID();
 const actorA=randomUUID(),actorB=randomUUID(),orgA=randomUUID(),orgB=randomUUID();
 const deviceA=randomUUID(),deviceB=randomUUID(),sessionA=randomUUID(),sessionB=randomUUID();
 const now=new Date(),expires=new Date(now.getTime()+3600000);
 const tokenA=issueTenantBoundSessionCredential(tenantA,randomBytes(32).toString("base64url"));
 const tokenB=issueTenantBoundSessionCredential(tenantB,randomBytes(32).toString("base64url"));
 const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
 await admin.connect();await runtime.connect();
 try{
  await applyMigrations(admin,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const legacyVault=await admin.query("SELECT to_regclass('public.fortress_vaults') AS table_name");
  if(legacyVault.rows[0]?.table_name===null){
   const skipped=await admin.query("SELECT version,applied_by FROM schema_migrations WHERE version IN ('054','055','056') ORDER BY version");
   assert.deepEqual(skipped.rows.map(x=>x.version),["054","055","056"]);
   assert.ok(skipped.rows.every(x=>String(x.applied_by)==="conditional-skip:legacy-schema-absent:fortress_vaults"));
  }
  await admin.query("INSERT INTO api_devices(id,tenant_id,organization_id,actor_id,device_key_hash,device_label,shared_device,status,trust_epoch,failed_auth_count,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'p0572-a',false,'active',1,0,$6,$6),($7,$8,$9,$10,$11,'p0572-b',false,'active',1,0,$6,$6)",[
   deviceA,tenantA,orgA,actorA,hash(randomBytes(32).toString("base64url")),now,deviceB,tenantB,orgB,actorB,hash(randomBytes(32).toString("base64url"))
  ]);
  await admin.query("INSERT INTO api_sessions(id,tenant_id,organization_id,actor_id,device_id,session_hash,status,trust_epoch,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,'active',1,$7,$8),($9,$10,$11,$12,$13,$14,'active',1,$7,$8)",[
   sessionA,tenantA,orgA,actorA,deviceA,hash(tokenA),now,expires,sessionB,tenantB,orgB,actorB,deviceB,hash(tokenB)
  ]);
  const identity=await runtime.query("SELECT session_user, current_user, r.rolsuper, r.rolbypassrls, pg_has_role(session_user,'tpay_school_runtime','member') AS runtime_member FROM pg_roles r WHERE r.rolname=session_user");
  assert.equal(identity.rows[0]?.rolsuper,false);
  assert.equal(identity.rows[0]?.rolbypassrls,false);
  assert.equal(identity.rows[0]?.runtime_member,true);

  await runtime.query("BEGIN");
  await runtime.query("SET LOCAL ROLE tpay_school_runtime");
  await runtime.query("SELECT set_config('tpay.tenant_id',$1,true)",[tenantA]);
  const sessions=await runtime.query("SELECT id,tenant_id FROM api_sessions ORDER BY id");
  assert.deepEqual(sessions.rows.map(x=>x.id),[sessionA]);
  const devices=await runtime.query("SELECT id,tenant_id FROM api_devices ORDER BY id");
  assert.deepEqual(devices.rows.map(x=>x.id),[deviceA]);
  const crossRead=await runtime.query("SELECT id FROM api_sessions WHERE id=$1",[sessionB]);
  assert.equal(crossRead.rowCount,0);
  const crossUpdate=await runtime.query("UPDATE api_sessions SET last_seen_at=$2 WHERE id=$1",[sessionB,now]);
  assert.equal(crossUpdate.rowCount,0);
  await runtime.query("COMMIT");
 }catch(error){
  await runtime.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{
  await admin.query("DELETE FROM api_sessions WHERE id IN ($1,$2)",[sessionA,sessionB]).catch(()=>undefined);
  await admin.query("DELETE FROM api_devices WHERE id IN ($1,$2)",[deviceA,deviceB]).catch(()=>undefined);
  await runtime.end();await admin.end();
 }
});
