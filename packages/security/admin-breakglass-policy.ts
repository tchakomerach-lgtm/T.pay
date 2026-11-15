/**
 * P057 Security 002 — privileged access and break-glass policy.
 * Pure policy layer; WebAuthn verification, persistence and KMS/HSM are adapters.
 */
export type AdminAssurance = "webauthn_uv" | "hardware_key";
export type AdminResource = "organization_record" | "school_record" | "financial_record" | "vault_metadata" | "vault_decrypt";
export type AdminPermission = "metadata_read" | "record_read" | "decrypt";
export interface AdminSessionContext {
 principalId:string; sessionId:string; assurance:AdminAssurance; active:boolean;
 expiresAt:string; revokedAt:string|null; userSessionId:null; securityPlane:"ADMIN_CONTROL";
}
export interface BreakglassContext {
 requestId:string; requesterPrincipalId:string; targetTenantId:string; targetOrganizationId:string|null;
 resourceType:AdminResource; resourceRef:string; permission:AdminPermission; purposeCode:string;
 justification:string; incidentOrTicketRef:string; requiredApprovals:2|3;
 approvals:Array<{principalId:string;sessionAssurance:AdminAssurance;sessionActive:boolean}>;
 status:"pending"|"approved"|"denied"|"expired"|"revoked"|"consumed";
 validFrom:string|null; expiresAt:string|null; revokedAt:string|null; consumedAt:string|null;
}
export type AdminAccessDenial =
 | "ADMIN_SESSION_INACTIVE"|"ADMIN_SESSION_REVOKED"|"ADMIN_SESSION_EXPIRED"|"ADMIN_SESSION_PLANE_MISMATCH"|"ADMIN_HARDWARE_KEY_REQUIRED"
 | "BREAKGLASS_NOT_APPROVED"|"BREAKGLASS_EXECUTOR_MISMATCH"|"BREAKGLASS_SCOPE_MISMATCH"|"BREAKGLASS_PERMISSION_MISMATCH"|"BREAKGLASS_PURPOSE_REQUIRED"
 | "BREAKGLASS_JUSTIFICATION_REQUIRED"|"BREAKGLASS_TICKET_REQUIRED"|"BREAKGLASS_SELF_APPROVAL"|"BREAKGLASS_QUORUM_NOT_MET"
 | "BREAKGLASS_APPROVER_INVALID"|"BREAKGLASS_NOT_YET_VALID"|"BREAKGLASS_EXPIRED"|"BREAKGLASS_REVOKED"
 | "BREAKGLASS_ALREADY_CONSUMED"|"BREAKGLASS_DURATION_INVALID";
export type AdminAccessDecision =
 | {allowed:true;requestId:string;tenantId:string;resourceRef:string;permission:AdminPermission;expiresAt:string}
 | {allowed:false;reason:AdminAccessDenial};
const instant=(s:string|null):number=>s===null?Number.NaN:Date.parse(s);
const deny=(reason:AdminAccessDenial):AdminAccessDecision=>({allowed:false,reason});
export function authorizeAdminSession(s:AdminSessionContext,now:string):AdminAccessDenial|null {
 const at=instant(now);
 if(!s.active)return "ADMIN_SESSION_INACTIVE";
 if(s.revokedAt!==null)return "ADMIN_SESSION_REVOKED";
 if(s.securityPlane!=="ADMIN_CONTROL"||s.userSessionId!==null)return "ADMIN_SESSION_PLANE_MISMATCH";
 if(s.assurance!=="hardware_key")return "ADMIN_HARDWARE_KEY_REQUIRED";
 if(!Number.isFinite(at)||!Number.isFinite(instant(s.expiresAt))||instant(s.expiresAt)<=at)return "ADMIN_SESSION_EXPIRED";
 return null;
}
export function authorizeBreakglassAccess(
 s:AdminSessionContext,r:BreakglassContext,
 t:{tenantId:string;organizationId:string|null;resourceType:AdminResource;resourceRef:string;permission:AdminPermission},
 now:string
):AdminAccessDecision {
 const e=authorizeAdminSession(s,now); if(e)return deny(e);
 if(r.revokedAt!==null)return deny("BREAKGLASS_REVOKED");
 if(r.consumedAt!==null||r.status==="consumed")return deny("BREAKGLASS_ALREADY_CONSUMED");
 if(r.status!=="approved")return deny("BREAKGLASS_NOT_APPROVED");
 if(s.principalId!==r.requesterPrincipalId)return deny("BREAKGLASS_EXECUTOR_MISMATCH");
 if(r.targetTenantId!==t.tenantId||r.targetOrganizationId!==t.organizationId||r.resourceType!==t.resourceType||r.resourceRef!==t.resourceRef)return deny("BREAKGLASS_SCOPE_MISMATCH");
 if(r.permission!==t.permission)return deny("BREAKGLASS_PERMISSION_MISMATCH");
 if(!r.purposeCode.trim())return deny("BREAKGLASS_PURPOSE_REQUIRED");
 if(r.justification.trim().length<20)return deny("BREAKGLASS_JUSTIFICATION_REQUIRED");
 if(!r.incidentOrTicketRef.trim())return deny("BREAKGLASS_TICKET_REQUIRED");
 if(r.approvals.some(a=>a.principalId===r.requesterPrincipalId))return deny("BREAKGLASS_SELF_APPROVAL");
 const valid=r.approvals.filter(a=>a.sessionActive&&a.sessionAssurance==="hardware_key");
 const distinct=new Set(valid.map(a=>a.principalId));
 if(distinct.size<r.requiredApprovals)return deny("BREAKGLASS_QUORUM_NOT_MET");
 if(valid.length!==r.approvals.length)return deny("BREAKGLASS_APPROVER_INVALID");
 const at=instant(now),from=instant(r.validFrom),until=instant(r.expiresAt);
 if(!Number.isFinite(at)||!Number.isFinite(from)||!Number.isFinite(until)||until<=from||until-from>3600000)return deny("BREAKGLASS_DURATION_INVALID");
 if(from>at)return deny("BREAKGLASS_NOT_YET_VALID");
 if(until<=at)return deny("BREAKGLASS_EXPIRED");
 return {allowed:true,requestId:r.requestId,tenantId:t.tenantId,resourceRef:t.resourceRef,permission:t.permission,expiresAt:r.expiresAt!};
}
