import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { applyMigrations } from "../packages/finance/src/postgres-migrations.js";
import { AdminPamCapabilityIssuer } from "../packages/security/admin-pam-capability-issuer.js";

const databaseUrl=process.env.TPAY_DATABASE_URL;
const hash=(value:string|Buffer)=>createHash("sha256").update(value).digest();

test("P060 PostgreSQL issues an exact one-use Admin capability and denies replay",{
 skip:!databaseUrl && "TPAY_DATABASE_URL is not configured"
},async()=>{
 const admin=new pg.Client({connectionString:databaseUrl});
 const pool=new pg.Pool({connectionString:databaseUrl,max:1});
 const ids={
  requester:randomUUID(),approverA:randomUUID(),approverB:randomUUID(),
  requesterCredential:randomUUID(),approverCredentialA:randomUUID(),approverCredentialB:randomUUID(),
  requesterSession:randomUUID(),approverSessionA:randomUUID(),approverSessionB:randomUUID(),
  request:randomUUID()
 };
 const tokens={requester:randomUUID()+randomUUID()};
 let membershipGranted=false;
 await admin.connect();
 try{
  await applyMigrations(admin,pathToFileURL(join(process.cwd(),"migrations")+"/"));
  await admin.query("GRANT tpay_admin_pam_runtime TO CURRENT_USER");
  membershipGranted=true;
  await admin.query("BEGIN");
  for(const principalId of [ids.requester,ids.approverA,ids.approverB]){
   await admin.query(
    "INSERT INTO tpay_admin_principals(id,subject_ref,status,assurance_floor,activated_at) VALUES($1,$2,'active','hardware_key',now())",
    [principalId,"p060-test-"+principalId]
   );
  }
  const credentials=[
   [ids.requesterCredential,ids.requester],
   [ids.approverCredentialA,ids.approverA],
   [ids.approverCredentialB,ids.approverB]
  ];
  for(const [credentialId,principalId] of credentials){
   await admin.query(
    "INSERT INTO tpay_admin_webauthn_credentials(id,principal_id,credential_id,public_key_cose,status) VALUES($1,$2,$3,$4,'active')",
    [credentialId,principalId,Buffer.from("credential-"+credentialId),Buffer.from("public-key-placeholder")]
   );
  }
  const sessions=[
   [ids.requesterSession,ids.requesterCredential,ids.requester,hash(tokens.requester)],
   [ids.approverSessionA,ids.approverCredentialA,ids.approverA,hash(randomUUID())],
   [ids.approverSessionB,ids.approverCredentialB,ids.approverB,hash(randomUUID())]
  ];
  for(const [sessionId,credentialId,principalId,tokenHash] of sessions){
   await admin.query(
    "INSERT INTO tpay_admin_sessions(id,principal_id,credential_id,token_hash,assurance,origin,expires_at) VALUES($1,$2,$3,$4,'hardware_key','https://admin.tpay.test',now()+interval '30 minutes')",
    [sessionId,principalId,credentialId,tokenHash]
   );
  }
  await admin.query(
   `INSERT INTO tpay_admin_breakglass_requests
    (id,requester_principal_id,target_tenant_id,target_organization_id,resource_type,
     resource_ref,requested_permission,purpose_code,justification,incident_or_ticket_ref,
     status,required_approvals,requested_at)
    VALUES($1,$2,'tenant-p060','org-p060','school_record','student-record-opaque',
     'record_read','incident-review','Investigation précise et limitée à un dossier scolaire identifié.',
     'INC-P060-001','pending',2,now())`,
   [ids.request,ids.requester]
  );
  for(const [principalId,sessionId] of [
   [ids.approverA,ids.approverSessionA],[ids.approverB,ids.approverSessionB]
  ]){
   await admin.query(
    "INSERT INTO tpay_admin_breakglass_approvals(request_id,approver_principal_id,session_id,decision) VALUES($1,$2,$3,'approve')",
    [ids.request,principalId,sessionId]
   );
  }
  await admin.query(
   "UPDATE tpay_admin_breakglass_requests SET status='approved',valid_from=now(),expires_at=now()+interval '20 minutes' WHERE id=$1",
   [ids.request]
  );
  await admin.query("COMMIT");

  const issuer=new AdminPamCapabilityIssuer(pool as unknown as import("pg").Pool);
  const result=await issuer.issue({
   principalId:ids.requester,sessionId:ids.requesterSession,
   sessionToken:tokens.requester,requestId:ids.request
  });
  assert.equal(result.allowed,true);
  if(!result.allowed)return;
  assert.equal(result.scope.tenantId,"tenant-p060");
  assert.equal(result.scope.organizationId,"org-p060");
  assert.equal(result.scope.resourceRef,"student-record-opaque");
  assert.equal(result.scope.permission,"record_read");
  const persisted=await admin.query(
   "SELECT token_hash,consumed_at,expires_at FROM tpay_admin_pam_capabilities WHERE id=$1",
   [result.capabilityId]
  );
  assert.equal(persisted.rowCount,1);
  assert.ok((persisted.rows[0]?.token_hash as Buffer).equals(hash(result.capability)));
  assert.ok(persisted.rows[0]?.consumed_at===null);
  const request=await admin.query("SELECT status,consumed_at FROM tpay_admin_breakglass_requests WHERE id=$1",[ids.request]);
  assert.equal(request.rows[0]?.status,"consumed");
  assert.ok(request.rows[0]?.consumed_at);
  const audit=await admin.query(
   "SELECT outcome,reason_code FROM tpay_admin_security_audit WHERE target_ref=$1 AND action='pam.capability.issue'",
   [ids.request]
  );
  assert.equal(audit.rows[0]?.outcome,"consumed");
  const replay=await issuer.issue({
   principalId:ids.requester,sessionId:ids.requesterSession,
   sessionToken:tokens.requester,requestId:ids.request
  });
  assert.deepEqual(replay,{allowed:false,reason:"BREAKGLASS_NOT_APPROVED_OR_ALREADY_USED"});
 }catch(error){
  await admin.query("ROLLBACK").catch(()=>undefined);
  throw error;
 }finally{
  await pool.end();
  if(membershipGranted)await admin.query("REVOKE tpay_admin_pam_runtime FROM CURRENT_USER").catch(()=>undefined);
  await admin.end();
 }
});
