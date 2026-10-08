export const OPPORTUNITY_STATES = [
  "DRAFT",
  "PUBLISHED",
  "MATCHING",
  "APPLICATIONS_OPEN",
  "REVIEW",
  "NEGOTIATION",
  "CONTRACTED",
  "IN_PROGRESS",
  "DELIVERABLE_REVIEW",
  "ACCEPTED",
  "COMPLETED",
  "PAUSED",
  "DISPUTED",
  "RECOVERY",
  "CANCELLED",
  "EXPIRED",
] as const;

export type OpportunityState = typeof OPPORTUNITY_STATES[number];

export type OpportunityCommand =
  | "PUBLISH"
  | "START_MATCHING"
  | "OPEN_APPLICATIONS"
  | "START_REVIEW"
  | "START_NEGOTIATION"
  | "CONTRACT"
  | "START_DELIVERY"
  | "SUBMIT_DELIVERABLE"
  | "ACCEPT"
  | "COMPLETE"
  | "PAUSE"
  | "RESUME"
  | "DISPUTE"
  | "RECOVER"
  | "CANCEL"
  | "EXPIRE";

export type OpportunityActorClass = "OWNER" | "PARTICIPANT" | "REVIEWER" | "MANAGER" | "SYSTEM" | "AGENT";

export interface OpportunityTransition {
  readonly from: OpportunityState;
  readonly to: OpportunityState;
  readonly command: OpportunityCommand;
  readonly actorClasses: readonly OpportunityActorClass[];
  readonly requiresHumanApproval: boolean;
}

const TRANSITIONS: readonly OpportunityTransition[] = [
  { from: "DRAFT", to: "PUBLISHED", command: "PUBLISH", actorClasses: ["OWNER", "MANAGER"], requiresHumanApproval: true },
  { from: "PUBLISHED", to: "MATCHING", command: "START_MATCHING", actorClasses: ["OWNER", "MANAGER", "SYSTEM", "AGENT"], requiresHumanApproval: false },
  { from: "PUBLISHED", to: "APPLICATIONS_OPEN", command: "OPEN_APPLICATIONS", actorClasses: ["OWNER", "MANAGER"], requiresHumanApproval: true },
  { from: "MATCHING", to: "REVIEW", command: "START_REVIEW", actorClasses: ["OWNER", "REVIEWER", "SYSTEM", "AGENT"], requiresHumanApproval: false },
  { from: "APPLICATIONS_OPEN", to: "REVIEW", command: "START_REVIEW", actorClasses: ["OWNER", "REVIEWER", "SYSTEM", "AGENT"], requiresHumanApproval: false },
  { from: "REVIEW", to: "NEGOTIATION", command: "START_NEGOTIATION", actorClasses: ["OWNER", "REVIEWER"], requiresHumanApproval: true },
  { from: "NEGOTIATION", to: "CONTRACTED", command: "CONTRACT", actorClasses: ["OWNER", "MANAGER"], requiresHumanApproval: true },
  { from: "CONTRACTED", to: "IN_PROGRESS", command: "START_DELIVERY", actorClasses: ["OWNER", "PARTICIPANT", "MANAGER"], requiresHumanApproval: false },
  { from: "IN_PROGRESS", to: "DELIVERABLE_REVIEW", command: "SUBMIT_DELIVERABLE", actorClasses: ["PARTICIPANT", "OWNER", "SYSTEM"], requiresHumanApproval: false },
  { from: "DELIVERABLE_REVIEW", to: "ACCEPTED", command: "ACCEPT", actorClasses: ["OWNER", "REVIEWER"], requiresHumanApproval: true },
  { from: "ACCEPTED", to: "COMPLETED", command: "COMPLETE", actorClasses: ["OWNER", "MANAGER", "SYSTEM"], requiresHumanApproval: false },
  { from: "IN_PROGRESS", to: "PAUSED", command: "PAUSE", actorClasses: ["OWNER", "PARTICIPANT", "MANAGER"], requiresHumanApproval: false },
  { from: "PAUSED", to: "IN_PROGRESS", command: "RESUME", actorClasses: ["OWNER", "PARTICIPANT", "MANAGER"], requiresHumanApproval: false },
  { from: "IN_PROGRESS", to: "DISPUTED", command: "DISPUTE", actorClasses: ["OWNER", "PARTICIPANT", "REVIEWER"], requiresHumanApproval: false },
  { from: "DISPUTED", to: "RECOVERY", command: "RECOVER", actorClasses: ["OWNER", "REVIEWER", "MANAGER"], requiresHumanApproval: true },
  { from: "RECOVERY", to: "IN_PROGRESS", command: "RESUME", actorClasses: ["OWNER", "PARTICIPANT", "MANAGER"], requiresHumanApproval: true },
  { from: "DRAFT", to: "CANCELLED", command: "CANCEL", actorClasses: ["OWNER", "MANAGER"], requiresHumanApproval: true },
  { from: "PUBLISHED", to: "CANCELLED", command: "CANCEL", actorClasses: ["OWNER", "MANAGER"], requiresHumanApproval: true },
  { from: "APPLICATIONS_OPEN", to: "CANCELLED", command: "CANCEL", actorClasses: ["OWNER", "MANAGER"], requiresHumanApproval: true },
  { from: "PUBLISHED", to: "EXPIRED", command: "EXPIRE", actorClasses: ["SYSTEM", "AGENT"], requiresHumanApproval: false },
  { from: "APPLICATIONS_OPEN", to: "EXPIRED", command: "EXPIRE", actorClasses: ["SYSTEM", "AGENT"], requiresHumanApproval: false },
] as const;

const TERMINAL_STATES = new Set<OpportunityState>(["COMPLETED", "CANCELLED", "EXPIRED"]);

export function transitionOpportunity(input: {
  current: OpportunityState;
  command: OpportunityCommand;
  actorClass: OpportunityActorClass;
  humanApproval?: boolean;
}): OpportunityTransition {
  const transition = TRANSITIONS.find(item =>
    item.from === input.current && item.command === input.command && item.actorClasses.includes(input.actorClass)
  );
  if (!transition) throw new Error("OPPORTUNITY_INVALID_TRANSITION");
  if (transition.requiresHumanApproval && input.humanApproval !== true) {
    throw new Error("OPPORTUNITY_HUMAN_APPROVAL_REQUIRED");
  }
  if (TERMINAL_STATES.has(input.current)) throw new Error("OPPORTUNITY_TERMINAL_STATE");
  return transition;
}

export function isTerminalOpportunityState(state: OpportunityState): boolean {
  return TERMINAL_STATES.has(state);
}

export function listAllowedTransitions(state: OpportunityState): readonly OpportunityTransition[] {
  return TRANSITIONS.filter(item => item.from === state);
}
