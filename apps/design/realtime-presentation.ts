import type { FreshnessState, SyncState } from "./realtime.js";

export type TPayRealtimePresentation = Readonly<{
  freshness: FreshnessState;
  sync: SyncState;
  changedFields: readonly string[];
  announcement: string;
  visualDiff: boolean;
  screenFlash: boolean;
}>;

export function assertRealtimePresentation(model: TPayRealtimePresentation): void {
  if (!model.announcement.trim()) throw new Error("Realtime presentation requires an accessible announcement");
  if (model.screenFlash) throw new Error("Full-screen flashing is forbidden");
  if (model.sync === "conflict" && model.changedFields.length === 0) {
    throw new Error("Realtime conflict requires affected fields");
  }
}
