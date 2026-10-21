import { randomUUID } from "node:crypto";
import type { OpportunityActorClass, OpportunityCommand } from "./lifecycle.js";

export interface OpportunityPrincipal {
  /** Set only by verified authentication middleware, never from request JSON. */
  readonly subjectId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly actorClass: OpportunityActorClass;
  readonly permissions: readonly string[];
}

export interface OpportunityTransitionCommand {
  readonly opportunityId: string;
  readonly command: OpportunityCommand;
  readonly idempotencyKey: string;
  readonly humanApproval?: boolean;
}

export interface OpportunityCommandResult {
  readonly status: 200 | 202;
  readonly body: {
    readonly opportunityId: string;
    readonly state: string;
    readonly version: string;
    readonly idempotent: boolean;
    readonly requestId: string;
  };
}

export interface OpportunityLifecyclePort {
  transition(input: {
    tenantId: string;
    organizationId: string;
    opportunityId: string;
    actorId: string;
    actorClass: OpportunityActorClass;
    command: OpportunityCommand;
    idempotencyKey: string;
    humanApproval?: boolean;
  }): Promise<{ opportunityId: string; state: string; version: bigint; idempotent: boolean }>;
}

export class OpportunityCommandError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422,
  ) {
    super(code);
    this.name = "OpportunityCommandError";
  }
}

const UUID_OR_OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const COMMANDS = new Set<OpportunityCommand>([
  "PUBLISH", "START_MATCHING", "OPEN_APPLICATIONS", "START_REVIEW",
  "START_NEGOTIATION", "CONTRACT", "START_DELIVERY", "SUBMIT_DELIVERABLE",
  "ACCEPT", "COMPLETE", "PAUSE", "RESUME", "DISPUTE", "RECOVER", "CANCEL", "EXPIRE",
]);

/**
 * Transport-neutral command boundary. HTTP adapters must pass a principal created
 * by verified authentication middleware; request bodies cannot supply actor/tenant IDs.
 * This boundary intentionally does not execute payments or arbitrary AI/tool calls.
 */
export async function executeOpportunityTransition(
  principal: OpportunityPrincipal | null,
  input: OpportunityTransitionCommand,
  lifecycle: OpportunityLifecyclePort,
): Promise<OpportunityCommandResult> {
  if (!principal?.subjectId || !principal.tenantId || !principal.organizationId) {
    throw new OpportunityCommandError("AUTHENTICATION_REQUIRED", 401);
  }
  if (!principal.permissions.includes("opportunity:transition")) {
    throw new OpportunityCommandError("OPPORTUNITY_TRANSITION_FORBIDDEN", 403);
  }
  if (!input || typeof input !== "object" ||
      typeof input.opportunityId !== "string" || !UUID_OR_OPAQUE_ID.test(input.opportunityId) ||
      typeof input.command !== "string" || !COMMANDS.has(input.command) ||
      typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(input.idempotencyKey) ||
      (input.humanApproval !== undefined && typeof input.humanApproval !== "boolean")) {
    throw new OpportunityCommandError("INVALID_OPPORTUNITY_COMMAND", 400);
  }

  const requestId = randomUUID();
  try {
    const result = await lifecycle.transition({
      tenantId: principal.tenantId,
      organizationId: principal.organizationId,
      opportunityId: input.opportunityId,
      actorId: principal.subjectId,
      actorClass: principal.actorClass,
      command: input.command,
      idempotencyKey: input.idempotencyKey,
      humanApproval: input.humanApproval,
    });
    return {
      status: result.idempotent ? 200 : 202,
      body: {
        opportunityId: result.opportunityId,
        state: result.state,
        version: result.version.toString(),
        idempotent: result.idempotent,
        requestId,
      },
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const code = error.message;
    if (code === "OPPORTUNITY_NOT_FOUND") throw new OpportunityCommandError(code, 404);
    if (code === "OPPORTUNITY_INVALID_TRANSITION" ||
        code === "OPPORTUNITY_HUMAN_APPROVAL_REQUIRED" ||
        code === "OPPORTUNITY_TERMINAL_STATE") {
      throw new OpportunityCommandError(code, 409);
    }
    if (code === "OPPORTUNITY_TRANSACTION_REQUIRED") throw new OpportunityCommandError(code, 422);
    throw error;
  }
}
