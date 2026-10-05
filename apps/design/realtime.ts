export type TPaySurfaceState =
  | "default" | "hover" | "focus" | "pressed" | "loading"
  | "success" | "warning" | "error" | "disabled"
  | "offline" | "syncing" | "conflict" | "permission-denied";

export type FreshnessState = "fresh" | "updated" | "stale" | "reconnecting" | "offline";
export type SyncState = "idle" | "queued" | "syncing" | "synced" | "failed" | "conflict";

export type StatusSemantics = Readonly<{
  state: TPaySurfaceState;
  label: string;
  icon: string;
  colorToken?: keyof typeof tpayTokens.color.status;
  ariaLive?: "off" | "polite" | "assertive";
}>;

export type RealtimeState = Readonly<{
  freshness: FreshnessState;
  sync: SyncState;
  lastUpdatedAt?: string;
  pendingChanges: number;
  conflictCount: number;
}>;

export function assertRealtimeState(state: RealtimeState): void {
  if (state.pendingChanges < 0 || state.conflictCount < 0) {
    throw new Error("Realtime counters cannot be negative");
  }
  if (state.sync === "conflict" && state.conflictCount === 0) {
    throw new Error("Conflict sync state requires at least one conflict");
  }
  if (state.freshness === "offline" && state.sync === "syncing") {
    throw new Error("Offline state cannot report an active sync");
  }
}
