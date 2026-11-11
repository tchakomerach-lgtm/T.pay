import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { AdminPamCapabilityIssuer } from "../packages/security/admin-pam-capability-issuer.js";

const hash=(v:string|Buffer)=>createHash("sha256").update(v).digest();
function fixture(opts?:{missingQuorum?:boolean;auditFails?:boolean;wrongAssurance?:boolean;rootRevoked?:boolean}) {
 const calls:string[]=[];\n const sqlLog:string[]=[];
 const inserted:{capabilityHash?:Buffer;requestStatus?:string;audit?:boolean}={};
 const client={
  async query(sql:string,params:unknown[]=[]):Promise<any>{
   calls.push(sql.trim().split(/\s+/).slice(0,3).join(" "));
   if(sql==="BEGIN"||sql==="COMMIT"||sql==="ROLLBACK"||sql==="SET LOCAL ROLE tpay_admin_pam_runtime")return {rows:[],rowCount:0};
   if(sql.includes("set_config"))return {rows:[],rowCount:1};
   if(sql.includes("FROM tpay_admin_sessions s")&&sql.includes("FOR UPDATE OF s"))return opts?.rootRevoked?{rows:[],rowCount:0}:{
    rows:opts?.wrongAssurance?[{principal_status:"active",session_id:"sess",session_expires_at:new Date("2026-11-11T12:00:00Z"),assurance:"webauthn_uv",credential_status:"active",credential_id:"cred"}]:
    [{principal_status:"active",session_id:"sess",session_expires_at:new Date("2026-11-11T12:00:00Z"),assurance:"hardware_key",credential_status:"active",credential_id:"cred"}],rowCount:1};
   if(sql.includes("FROM tpay_admin_breakglass_requests")&&sql.includes("FOR UPDATE"))return {rows:[{
    id:"req",target_tenant_id:"tenant-a",target_organization_id:"org-a",resource_type:"school_record",
    resource_ref:"record-opaque-1",requested_permission:"record_read",purpose_code:"incident-review",
    incident_or_ticket_ref:"INC-123",status:"approved",required_approvals:2,
    valid_from:new Date("2026-11-11T10:00:00Z"),expires_at:new Date("2026-11-11T10:30:00Z"),
    requester_principal_id:"admin-1"}],rowCount:1};
   if(sql.includes("SELECT $1::timestamptz"))return {rows:[{valid:true}],rowCount:1};
   if(sql.includes("FROM tpay_admin_breakglass_approvals"))return {rows:[{count:opts?.missingQuorum?"1":"2"}],rowCount:1};
   if(sql.includes("INSERT INTO tpay_admin_pam_capabilities")){inserted.capabilityHash=params[4] as Buffer;return {rows:[{id:"cap-1",expires_at:new Date("2026-11-11T10:30:00Z")}],rowCount:1};}
   if(sql.includes("UPDATE tpay_admin_breakglass_requests")){inserted.requestStatus="consumed";return {rows:[],rowCount:1};}
   if(sql.includes("INSERT INTO tpay_admin_security_audit")){if(opts?.auditFails)throw new Error("AUDIT_FAIL");inserted.audit=true;return {rows:[],rowCount:1};}
   return {rows:[],rowCount:1};
  },
  release(){calls.push("release");}
 };
 return {pool:{connect:async()=>client} as unknown as Pool,calls,inserted,sqlLog};
}
const input={principalId:"admin-1",sessionId:"sess",sessionToken:"a".repeat(48),requestId:"req",now:"2026-11-11T10:05:00.000Z"};

test("P060 issues only opaque exact-scope capability after independent quorum and commits audit atomically",async()=>{
 const f=fixture();const issuer=new AdminPamCapabilityIssuer(f.pool);
 const result=await issuer.issue(input);
 assert.equal(result.allowed,true);
 if(!result.allowed)return;
 assert.equal(result.scope.tenantId,"tenant-a");
 assert.equal(result.scope.resourceRef,"record-opaque-1");
 assert.equal(result.scope.permission,"record_read");
 assert.equal(f.inserted.requestStatus,"consumed");
 assert.equal(f.inserted.audit,true);
 assert.deepEqual(f.calls.slice(-2),["INSERT INTO tpay_admin_security_audit","COMMIT"]);
 assert.ok(f.inserted.capabilityHash?.equals(hash(result.capability)));
 assert.ok(!f.inserted.capabilityHash?.equals(Buffer.from(result.capability)));
});

test("P060 refuses non-hardware Admin sessions",async()=>{
 const f=fixture({wrongAssurance:true});
 const result=await new AdminPamCapabilityIssuer(f.pool).issue(input);
 assert.deepEqual(result,{allowed:false,reason:"ADMIN_SESSION_INVALID_OR_INSUFFICIENT_ASSURANCE"});
 assert.ok(f.calls.includes("ROLLBACK"));
});

test("P060 refuses an incomplete independent approval quorum",async()=>{
 const f=fixture({missingQuorum:true});
 const result=await new AdminPamCapabilityIssuer(f.pool).issue(input);
 assert.deepEqual(result,{allowed:false,reason:"BREAKGLASS_QUORUM_NOT_MET"});
 assert.ok(!f.calls.some(x=>x==="INSERT INTO tpay_admin_pam_capabilities"));
});

test("P060 rolls back capability and request consumption when audit fails",async()=>{
 const f=fixture({auditFails:true});
 await assert.rejects(()=>new AdminPamCapabilityIssuer(f.pool).issue(input),/AUDIT_FAIL/);
 assert.ok(f.calls.includes("ROLLBACK"));
 assert.ok(!f.calls.includes("COMMIT"));
});

test("P064 PAM issuer binds requester and approver sessions to active hardware-attested roots",async()=>{
 const f=fixture();
 await new AdminPamCapabilityIssuer(f.pool).issue(input);
 const sessionSql=f.sqlLog.find(q=>q.includes("FROM tpay_admin_sessions s")&&q.includes("FOR UPDATE OF s"))??"";
 const quorumSql=f.sqlLog.find(q=>q.includes("FROM tpay_admin_breakglass_approvals"))??"";
 assert.match(sessionSql,/tpay_admin_webauthn_attestation_roots/);
 assert.match(sessionSql,/hardware_attested=true/);
 assert.match(quorumSql,/tpay_admin_webauthn_attestation_roots/);
 assert.match(quorumSql,/hardware_attested=true/);
 const revoked=fixture({rootRevoked:true});
 assert.deepEqual(await new AdminPamCapabilityIssuer(revoked.pool).issue(input),
  {allowed:false,reason:"ADMIN_SESSION_INVALID_OR_INSUFFICIENT_ASSURANCE"});
});
