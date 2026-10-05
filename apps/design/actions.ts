export type TPayActionState =
  | "idle" | "authorizing" | "previewing" | "awaiting-confirmation"
  | "executing" | "succeeded" | "warning" | "failed"
  | "blocked" | "offline" | "conflict";

export type TPayActionContract = Readonly<{
  actionId: string;
  verb: string;
  objectType: string;
  objectId: string;
  contextId: string;
  state: TPayActionState;
  consequential: boolean;
  permissionDeniedReason?: string;
}>;

export function assertActionContract(action: TPayActionContract): void {
  if (!action.actionId || !action.verb || !action.objectType || !action.objectId || !action.contextId) {
    throw new Error("Action contract is incomplete");
  }
  if (action.state === "blocked" && !action.permissionDeniedReason) {
    throw new Error("Blocked action requires a reason");
  }
}
