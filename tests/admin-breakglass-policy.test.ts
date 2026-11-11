import test from "node:test";
import assert from "node:assert/strict";
import {authorizeAdminSession,authorizeBreakglassAccess,type AdminSessionContext,type BreakglassContext} from "../packages/security/admin-breakglass-policy.js";
const now="2026-11-11T05:00:00.000Z";
const session:AdminSessionContext={principalId:"admin-1",sessionId:"session-1",assurance:"hardware_key",active:true,expiresAt:"2026-11-11T05:15:00.000Z",revokedAt:null,userSessionId:null,securityPlane:"ADMIN_CONTROL"};
const request:BreakglassContext={requestId:"bg-1",requesterPrincipalId:"admin-requester",targetTenantId:"tenant-a",targetOrganizationId:"org-a",resourceType:"school_record",resourceRef:"student-record-42",permission:"record_read",purposeCode:"incident-investigation",justification:"Investigate a reported unauthorized change to a student record.",incidentOrTicketRef:"SEC-2026-0042",requiredApprovals:2,approvals:[{principalId:"approver-a",sessionAssurance:"hardware_key",sessionActive:true},{principalId:"approver-b",sessionAssurance:"hardware_key",sessionActive:true}],status:"approved",validFrom:"2026-11-11T04:59:00.000Z",expiresAt:"2026-11-11T05:20:00.000Z",revokedAt:null,consumedAt:null};
const target={tenantId:"tenant-a",organizationId:"org-a",resourceType:"school_record" as const,resourceRef:"student-record-42",permission:"record_read" as const};
test("Admin session is hardware-backed and never accepts a user session",()=>{
 assert.equal(authorizeAdminSession(session,now),null);
 assert.equal(authorizeAdminSession({...session,userSessionId:"user-session"} as unknown as AdminSessionContext,now),"ADMIN_SESSION_PLANE_MISMATCH");
 assert.equal(authorizeAdminSession({...session,assurance:"webauthn_uv"},now),"ADMIN_HARDWARE_KEY_REQUIRED");
});
test("break-glass is exact-resource scoped and quorum controlled",()=>{
 assert.equal(authorizeBreakglassAccess(session,request,target,now).allowed,true);
 assert.deepEqual(authorizeBreakglassAccess(session,{...request,resourceRef:"other"},target,now),{allowed:false,reason:"BREAKGLASS_SCOPE_MISMATCH"});
 assert.deepEqual(authorizeBreakglassAccess(session,{...request,approvals:request.approvals.slice(0,1)},target,now),{allowed:false,reason:"BREAKGLASS_QUORUM_NOT_MET"});
});
test("requester cannot approve; expired and revoked requests fail closed",()=>{
 const self={...request,approvals:[{principalId:request.requesterPrincipalId,sessionAssurance:"hardware_key" as const,sessionActive:true},{principalId:"approver-b",sessionAssurance:"hardware_key" as const,sessionActive:true}]};
 assert.deepEqual(authorizeBreakglassAccess(session,self,target,now),{allowed:false,reason:"BREAKGLASS_SELF_APPROVAL"});
 assert.deepEqual(authorizeBreakglassAccess(session,{...request,expiresAt:"2026-11-11T04:59:00.000Z"},target,now),{allowed:false,reason:"BREAKGLASS_EXPIRED"});
 assert.deepEqual(authorizeBreakglassAccess(session,{...request,revokedAt:now},target,now),{allowed:false,reason:"BREAKGLASS_REVOKED"});
});
test("only the requesting Admin may execute the approved scope",()=>{
 assert.deepEqual(authorizeBreakglassAccess({...session,principalId:"other-admin"},request,target,now),{allowed:false,reason:"BREAKGLASS_EXECUTOR_MISMATCH"});
});
test("pending request does not grant standing access",()=>{
 assert.deepEqual(authorizeBreakglassAccess(session,{...request,status:"pending"},target,now),{allowed:false,reason:"BREAKGLASS_NOT_APPROVED"});
});
