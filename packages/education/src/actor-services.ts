export type ActorKind = "DIRECTOR" | "ADMIN" | "TEACHER" | "STUDENT" | "PARENT" | "COUNSELOR" | "HR" | "SECURITY" | "TRANSPORT" | "CANTEEN";
export type ServiceStatus = "SUBMITTED" | "TRIAGED" | "IN_PROGRESS" | "WAITING_ACTOR" | "WAITING_EXTERNAL" | "RESOLVED" | "REJECTED" | "CANCELLED";
export type ServicePriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export interface ActorRef { actorId: string; organizationId: string; kind: ActorKind; active: boolean; }
export interface ServiceRequest {
  id: string; organizationId: string; requesterId: string; serviceCode: string;
  status: ServiceStatus; priority: ServicePriority; assignedTo: string | null;
  createdAt: string; dueAt: string | null; version: bigint;
}
export interface ServiceTransition {
  from: ServiceStatus; to: ServiceStatus; actorId: string; at: string; reason?: string;
}

const allowed: Record<ServiceStatus, readonly ServiceStatus[]> = {
  SUBMITTED: ["TRIAGED", "CANCELLED"], TRIAGED: ["IN_PROGRESS", "REJECTED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_ACTOR", "WAITING_EXTERNAL", "RESOLVED", "REJECTED"],
  WAITING_ACTOR: ["IN_PROGRESS", "CANCELLED"], WAITING_EXTERNAL: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: [], REJECTED: [], CANCELLED: [],
};

export function assertServiceTransition(from: ServiceStatus, to: ServiceStatus): void {
  if (!allowed[from].includes(to)) throw new Error("INVALID_SERVICE_TRANSITION");
}
export function assignService(request: ServiceRequest, actor: ActorRef): ServiceRequest {
  if (actor.organizationId !== request.organizationId) throw new Error("SERVICE_CROSS_ORGANIZATION_ASSIGNMENT");
  if (!actor.active) throw new Error("SERVICE_ACTOR_INACTIVE");
  if (request.status !== "TRIAGED" && request.status !== "IN_PROGRESS") throw new Error("SERVICE_NOT_ASSIGNABLE");
  return { ...request, assignedTo: actor.actorId, status: "IN_PROGRESS", version: request.version + 1n };
}
export function transitionService(request: ServiceRequest, transition: ServiceTransition): ServiceRequest {
  if (transition.from !== request.status) throw new Error("SERVICE_STALE_TRANSITION");
  if (transition.actorId !== request.assignedTo && transition.to !== "TRIAGED") throw new Error("SERVICE_ACTOR_NOT_ASSIGNED");
  assertServiceTransition(request.status, transition.to);
  if (!transition.reason?.trim() && ["REJECTED", "CANCELLED"].includes(transition.to)) throw new Error("SERVICE_TERMINATION_REASON_REQUIRED");
  return { ...request, status: transition.to, version: request.version + 1n };
}
export function nextServiceAction(request: ServiceRequest, nowMs: number): "ESCALATE" | "ACT" | "WAIT" | "DONE" {
  if (request.status === "RESOLVED" || request.status === "REJECTED" || request.status === "CANCELLED") return "DONE";
  if (request.dueAt !== null && Date.parse(request.dueAt) < nowMs) return "ESCALATE";
  if (request.status === "WAITING_ACTOR" || request.status === "WAITING_EXTERNAL") return "WAIT";
  return "ACT";
}

export interface ActorView {
  actorId: string; kind: ActorKind; organizationId: string;
  allowedFields: readonly string[]; data: Record<string, unknown>;
}
export function projectActorView(actor: ActorRef, requestedFields: readonly string[], data: Record<string, unknown>): ActorView {
  const sensitive = new Set(["medical_notes", "financial_balance", "private_contact", "security_case"]);
  const allowedFields = requestedFields.filter((field) => !sensitive.has(field));
  const projected: Record<string, unknown> = {};
  for (const field of allowedFields) if (field in data) projected[field] = data[field];
  return { actorId: actor.actorId, kind: actor.kind, organizationId: actor.organizationId, allowedFields, data: projected };
}
