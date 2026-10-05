import type { FreshnessState, SyncState } from "./realtime.js";

export type TPayObjectSensitivity = "public" | "internal" | "sensitive" | "restricted";
export type TPayObjectStatus = "draft" | "active" | "pending" | "blocked" | "completed" | "archived" | "error";

export type TPayUniversalObject = Readonly<{
  objectType: string;
  objectId: string;
  contextId: string;
  organizationId?: string;
  title: string;
  subtitle?: string;
  status: TPayObjectStatus;
  sensitivity: TPayObjectSensitivity;
  freshness: FreshnessState;
  sync: SyncState;
  version: number;
  updatedAt?: string;
  availableActions: readonly string[];
}>;

export function assertUniversalObject(object: TPayUniversalObject): void {
  if (!object.objectType || !object.objectId || !object.contextId || !object.title) {
    throw new Error("Universal object identity is incomplete");
  }
  if (!Number.isInteger(object.version) || object.version < 1) {
    throw new Error("Universal object version must be a positive integer");
  }
  if (object.sensitivity !== "public" && !object.organizationId) {
    throw new Error("Non-public object requires organization binding");
  }
  if (object.sync === "conflict" && object.freshness === "offline") {
    throw new Error("Offline object cannot hide an unresolved synchronization conflict");
  }
}
