export type OrganizationPermission = "org.read"|"org.manage"|"members.manage"|"roles.manage"|"documents.manage"|"communications.manage"|"marketplace.manage"|"recruitment.manage"|"wallet.view"|"wallet.transact"|"finance.approve";
export interface OrganizationRole { id:string; organizationId:string; code:string; permissions:OrganizationPermission[]; version:number; }
export interface OrganizationMember { organizationId:string; userId:string; roleId:string; status:"invited"|"active"|"suspended"|"removed"; }
export function assertTenantScope(orgId:string, member:OrganizationMember, role:OrganizationRole){if(member.organizationId!==orgId||role.organizationId!==orgId) throw new Error("ORG_TENANT_MISMATCH");}
export function can(role:OrganizationRole, permission:OrganizationPermission):boolean{return role.permissions.includes(permission);}
export function assertPermission(orgId:string,member:OrganizationMember,role:OrganizationRole,p:OrganizationPermission){assertTenantScope(orgId,member,role);if(member.status!=="active")throw new Error("ORG_MEMBER_NOT_ACTIVE");if(!can(role,p))throw new Error("ORG_PERMISSION_DENIED");}
export function assertFinancialApproval(orgId:string,member:OrganizationMember,role:OrganizationRole){assertPermission(orgId,member,role,"finance.approve");}
