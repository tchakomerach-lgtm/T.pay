import test from "node:test";
import assert from "node:assert/strict";
import { assertAuthorized } from "../packages/security/src/authorization.js";
import type { Principal } from "../packages/security/src/policy.js";

const principal: Principal = {
  userId: "user-a",
  organizationId: "org-a",
  permissions: ["org.read", "finance.read"],
  sessionId: "session-a"
};

test("authorization accepts a matching tenant, resource and permission", () => {
  assert.doesNotThrow(() => assertAuthorized(principal, {
    organizationId: "org-a",
    resourceOrganizationId: "org-a",
    requestedPermission: "finance.read"
  }));
});

test("authorization denies a principal from another tenant", () => {
  assert.throws(() => assertAuthorized(principal, {
    organizationId: "org-b",
    resourceOrganizationId: "org-b",
    requestedPermission: "finance.read"
  }), /ORGANIZATION_CONTEXT_REQUIRED/);
});

test("authorization denies a resource whose tenant differs from the active tenant", () => {
  assert.throws(() => assertAuthorized(principal, {
    organizationId: "org-a",
    resourceOrganizationId: "org-b",
    requestedPermission: "finance.read"
  }), /RESOURCE_ORGANIZATION_MISMATCH/);
});

test("authorization denies a non-owner without org.manage", () => {
  assert.throws(() => assertAuthorized(principal, {
    organizationId: "org-a",
    resourceOrganizationId: "org-a",
    resourceOwnerId: "user-b",
    requestedPermission: "finance.read"
  }), /RESOURCE_OWNER_MISMATCH/);
});

test("authorization denies missing permissions by default", () => {
  assert.throws(() => assertAuthorized(principal, {
    organizationId: "org-a",
    resourceOrganizationId: "org-a",
    requestedPermission: "finance.initiate"
  }), /FORBIDDEN:finance.initiate/);
});

test("org.manage is the explicit permission required for cross-owner management", () => {
  const manager: Principal = { ...principal, permissions: ["org.manage"] };
  assert.doesNotThrow(() => assertAuthorized(manager, {
    organizationId: "org-a",
    resourceOrganizationId: "org-a",
    resourceOwnerId: "user-b",
    requestedPermission: "org.manage"
  }));
});
