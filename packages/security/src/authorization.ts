import type { Permission, Principal } from "./policy.js";

export interface AuthorizationContext {
  organizationId: string;
  resourceOwnerId?: string;
  resourceOrganizationId?: string;
  requestedPermission: Permission;
}

export function assertAuthorized(principal: Principal, context: AuthorizationContext): void {
  if (principal.organizationId !== context.organizationId) {
    throw new Error("ORGANIZATION_CONTEXT_REQUIRED");
  }
  if (context.resourceOrganizationId !== undefined &&
      context.resourceOrganizationId !== context.organizationId) {
    throw new Error("RESOURCE_ORGANIZATION_MISMATCH");
  }
  if (context.resourceOwnerId !== undefined &&
      context.resourceOwnerId !== principal.userId &&
      context.requestedPermission !== "org.manage") {
    throw new Error("RESOURCE_OWNER_MISMATCH");
  }
  if (!principal.permissions.includes(context.requestedPermission)) {
    throw new Error(`FORBIDDEN:${context.requestedPermission}`);
  }
}
