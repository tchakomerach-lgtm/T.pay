import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { approveJitGrant } from "../packages/security/src/privileged-session-repository.js";
import { transitionRecoveryAtomically } from "../packages/security/src/recovery-repository.js";
import { authorizeRootOperationWithQuorum, NodeVerificationProvider } from "../packages/security/src/root-trust-provider.js";
import { requestDigest } from "../packages/security/src/super-admin-control.js";
import { changeMaintenanceAtomically } from "../packages/security/src/maintenance-repository.js";

const url=process.env.TPAY_DATABASE_URL;
test("PostgreSQL adversarial control-plane concurrency",{skip:!url&&"TPAY_DATABASE_URL not configured"},async()=>{
 const admin=new pg.Client({connectionString:url});const pool=new pg.Pool({connectionString:url,max:20});
 await admin.connect();
 const ids:string[]=[];const grants:string[]=[];const runs:string[]=[];const roots:string[]=[];
 try{
  await applyMigrations(admin,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  const principal=randomUUID(),a=randomUUID(),b=randomUUID(),c=randomUUID();ids.push(principal,a,b,c);
  for(const id of ids)await admin.query("INSERT INTO tpay_privileged_identities(id,human_user_id,privileged_level,device_id,assurance,expires_at) VALUES($1,$2,'L4_SUPER_ADMIN',$3,'FIDO2',now()+interval '1 hour')",[id,"concurrency-"+id,"device-"+id]);
  const grant=randomUUID();grants.push(grant);
  await admin.query("INSERT INTO tpay_privileged_grants(id,principal_id,resource,action,justification,issued_at,expires_at,one_shot,approval_count,required_approvals) VALUES($1,$2,'prod/db','read','concurrency',now(),now()+interval '10 minutes',true,0,2)",[grant,principal]);
  const same=await Promise.allSettled([approveJitGrant(pool,{grantId:grant,approverId:a}),approveJitGrant(pool,{grantId:grant,approverId:a})]);
  assert.equal(same.filter(x=>x.status==="fulfilled").length,1);
  const different=await Promise.allSettled([approveJitGrant(pool,{grantId:grant,approverId:b}),approveJitGrant(pool,{grantId:grant,approverId:c})]);
  assert.equal(different.filter(x=>x.status==="fulfilled").length,2);
  assert.equal(Number((await admin.query("SELECT approval_count FROM tpay_privileged_grants WHERE id=$1",[grant])).rows[0].approval_count),2);

  const run=randomUUID();runs.push(run);
  await admin.query("INSERT INTO tpay_recovery_runs(id,incident_id,state,started_at,last_transition_at,evidence_digest) VALUES($1,'conc', 'ISOLATED',now(),now(),$2)",[run,"0".repeat(64)]);
  const rec=await Promise.allSettled([transitionRecoveryAtomically(pool,{runId:run,next:"FORENSIC",evidence:{x:1}}),transitionRecoveryAtomically(pool,{runId:run,next:"FORENSIC",evidence:{x:1}})]);
  assert.equal(rec.filter(x=>x.status==="fulfilled").length,1);
  assert.equal((await admin.query("SELECT state FROM tpay_recovery_runs WHERE id=$1",[run])).rows[0].state,"FORENSIC");

  const keyData=[a,b,c].map(actor=>{const k=generateKeyPairSync("ed25519");return{actor,k,der:k.publicKey.export({type:"spki",format:"der"}) as Buffer}});
  const request={operation:"maintenance-root",nonce:randomUUID()};const digest=requestDigest(request);
  for(const [i,x] of keyData.entries())await admin.query("INSERT INTO tpay_privileged_verification_keys(id,privileged_identity_id,credential_id,algorithm,public_key_der,hardware_backed) VALUES($1,$2,$3,'Ed25519',$4,false)",[randomUUID(),x.actor,"root-"+i,x.der]);
  const domains=["identity","security","infrastructure"] as const;
  const approvals=keyData.map((x,i)=>({actorId:x.actor,domain:domains[i] ?? "identity",algorithm:"Ed25519" as const,signature:sign(null,Buffer.from(digest),x.k.privateKey),credentialId:"root-"+i}));
  const rootResults=await Promise.allSettled([authorizeRootOperationWithQuorum(pool,{operation:"TEST",request,expiresAt:new Date(Date.now()+60000),approvals,provider:new NodeVerificationProvider() }),authorizeRootOperationWithQuorum(pool,{operation:"TEST",request,expiresAt:new Date(Date.now()+60000),approvals,provider:new NodeVerificationProvider() })]);
  assert.equal(rootResults.filter(x=>x.status==="fulfilled").length,1);
  roots.push(String(rootResults.find(x=>x.status==="fulfilled")?.status==="fulfilled" ? (rootResults.find(x=>x.status==="fulfilled") as PromiseFulfilledResult<any>).value.operationId : ""));

  const maintenance=await admin.query("SELECT version FROM tpay_maintenance_control WHERE singleton_id=1");const v=Number(maintenance.rows[0].version);
  const m=await Promise.allSettled([changeMaintenanceAtomically(pool,{expectedVersion:v,mode:"readonly",actorId:"maint-a",reason:"race test one"}),changeMaintenanceAtomically(pool,{expectedVersion:v,mode:"maintenance",actorId:"maint-b",reason:"race test two"})]);
  assert.equal(m.filter(x=>x.status==="fulfilled").length,1);
 }finally{
  for(const r of runs)await admin.query("DELETE FROM tpay_recovery_transitions WHERE recovery_run_id=$1",[r]).catch(()=>{});
  for(const r of runs)await admin.query("DELETE FROM tpay_recovery_runs WHERE id=$1",[r]).catch(()=>{});
  for(const g of grants)await admin.query("DELETE FROM tpay_privileged_sessions WHERE grant_id=$1",[g]).catch(()=>{});
  for(const g of grants)await admin.query("DELETE FROM tpay_jit_approvals WHERE grant_id=$1",[g]).catch(()=>{});
  for(const g of grants)await admin.query("DELETE FROM tpay_privileged_grants WHERE id=$1",[g]).catch(()=>{});
  await admin.query("DELETE FROM tpay_root_operations WHERE request_digest IS NOT NULL AND operation='TEST'").catch(()=>{});
  await admin.query("DELETE FROM tpay_privileged_verification_keys WHERE privileged_identity_id = ANY($1::uuid[])",[ids]).catch(()=>{});
  await admin.query("DELETE FROM tpay_privileged_identities WHERE id = ANY($1::uuid[])",[ids]).catch(()=>{});
  await pool.end();await admin.end();
 }
});
