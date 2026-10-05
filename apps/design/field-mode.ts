export type TPayFieldMode = "standard" | "low-bandwidth" | "low-power" | "offline";

export type TPayFieldDisplayPolicy = Readonly<{
  mode: TPayFieldMode;
  maxListItems: number;
  preferTextOverMedia: boolean;
  animationsEnabled: boolean;
  autoRefreshSeconds: number | null;
  allowLargeImages: boolean;
}>;

export function assertFieldDisplayPolicy(policy: TPayFieldDisplayPolicy): void {
  if (policy.maxListItems < 1) throw new Error("Field mode must expose at least one item");
  if (policy.mode !== "standard" && policy.animationsEnabled) throw new Error("Degraded field modes must disable non-essential animation");
  if (policy.mode === "low-bandwidth" && policy.allowLargeImages) throw new Error("Low-bandwidth mode cannot allow large images by default");
  if (policy.mode === "offline" && policy.autoRefreshSeconds !== null) throw new Error("Offline mode cannot request automatic refresh");
}