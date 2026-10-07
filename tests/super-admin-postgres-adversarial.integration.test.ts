import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { approveJitGrant, consumeJitGrantAtomically } from "../packages/security/src/privileged-session-repository.js";
const databaseUrl=process.env.TPAY_DATABASE_URL;
test("PostgreSQL adversarial JIT: concurrent consumption permits exactly one session",{skip:!databaseUrl&&"TPAY_DATABASE_URL not configured"},async()=>{
 const admin=new pg.Client({connectionString:databaseUrl});await admin.connect(); const pool=new pg.Pool({connectionString:databaseUrl,max:10});
 const id=randomUUID(),grant=randomUUID(),a=randomUUID(),b=randomUUID();
 try{
  await applyMigrations(admin,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  await admin.query("INSERT INTO tpay_privileged_identities(id,human_user_id,privileged_level,device_id,assurance,expires_at) VALUES($1,$2,'L4_SUPER_ADMIN',$3,'FIDO2',now()+interval '1 hour')",[id,"test-"+id,"device-"+id]);
  await admin.query("INSERT INTO tpay_privileged_identities(id,human_user_id,privileged_level,device_id,assurance,expires_at) VALUES($1,$2,'L4_SUPER_ADMIN',$3,'FIDO2',now()+interval '1 hour')",[a,"test-a-"+id,"device-a-"+id]);
  await admin.query("INSERT INTO tpay_privileged_identities(id,human_user_id,privileged_level,device_id,assurance,expires_at) VALUES($1,$2,'L4_SUPER_ADMIN',$3,'FIDO2',now()+interval '1 hour')",[b,"test-b-"+id,"device-b-"+id]);
  await admin.query("INSERT INTO tpay_privileged_grants(id,principal_id,resource,action,justification,issued_at,expires_at,one_shot,approval_count,required_approvals) VALUES($1,$2,'prod/db','read','concurrency test',now(),now()+interval '10 minutes',true,0,2)",[grant,id]);
  await approveJitGrant(pool,{grantId:grant,approverId:a});
  await approveJitGrant(pool,{grantId:grant,approverId:b});
  const results=await Promise.allSettled(Array.from({length:8},()=>consumeJitGrantAtomically(pool,{grantId:grant,principalId:id})));
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  const row=await admin.query("SELECT consumed_at FROM tpay_privileged_grants WHERE id=$1",[grant]);
  assert.ok(row.rows[0].consumed_at);
  const sessions=await admin.query("SELECT count(*)::int AS n FROM tpay_privileged_sessions WHERE grant_id=$1",[grant]);
  assert.equal(sessions.rows[0].n,1);
  await pool.end();
 }finally{
  await admin.query("DELETE FROM tpay_privileged_sessions WHERE grant_id=$1",[grant]);
  await admin.query("DELETE FROM tpay_jit_approvals WHERE grant_id=$1",[grant]);
  await admin.query("DELETE FROM tpay_privileged_grants WHERE id=$1",[grant]);
  await admin.query("DELETE FROM tpay_privileged_identities WHERE id IN ($1,$2,$3)",[id,a,b]);
  await pool.end(); await admin.end();
 }
});
