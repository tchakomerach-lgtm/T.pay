import type { TPayActionContract } from "./actions.js";

export type TPayActionPresentation = Readonly<{
  action: TPayActionContract;
  label: string;
  confirmationRequired: boolean;
  previewRequired: boolean;
  blockedExplanation?: string;
  resultMessage?: string;
  retryable: boolean;
  destructive: boolean;
}>;

export function assertActionPresentation(model: TPayActionPresentation): void {
  if (!model.label) throw new Error("Action presentation requires a visible label");
  if (model.action.state === "blocked" && !model.blockedExplanation) {
    throw new Error("Blocked action presentation requires explanation");
  }
  if (model.destructive && !model.confirmationRequired) {
    throw new Error("Destructive action requires confirmation");
  }
  if (model.action.consequential && !model.previewRequired && !model.confirmationRequired) {
    throw new Error("Consequential action requires preview or confirmation");
  }
}
