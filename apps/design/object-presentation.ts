import type { TPayUniversalObject } from "./objects.js";

export type TPayObjectPresentation = Readonly<{
  object: TPayUniversalObject;
  headingLevel: 1 | 2 | 3 | 4 | 5 | 6;
  showStatus: boolean;
  showFreshness: boolean;
  showContext: boolean;
  showActivity: boolean;
  compact: boolean;
  sensitiveFieldsHidden: boolean;
  redactionReason?: string;
}>;

export function assertObjectPresentation(model: TPayObjectPresentation): void {
  if (model.object.sensitivity !== "public" && !model.sensitiveFieldsHidden) {
    throw new Error("Sensitive object presentation requires field redaction");
  }
  if (model.sensitiveFieldsHidden && !model.redactionReason) {
    throw new Error("Redaction requires an explanation");
  }
  if (model.headingLevel < 1 || model.headingLevel > 6) {
    throw new Error("Invalid heading level");
  }
}
