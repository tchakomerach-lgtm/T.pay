export type TPayContextKind = "personal" | "organization" | "team" | "project" | "field";

export type TPayContext = Readonly<{
  kind: TPayContextKind;
  id: string;
  label: string;
  organizationId?: string;
  parentId?: string;
}>;

export type TPayContextStack = Readonly<{
  active: TPayContext;
  ancestors: readonly TPayContext[];
}>;

export function assertContextStack(stack: TPayContextStack): void {
  if (!stack.active.id || !stack.active.label) throw new Error("Active context requires id and label");
  if (stack.active.kind !== "personal" && !stack.active.organizationId) {
    throw new Error("Non-personal context requires organizationId");
  }
}
