import type { FreshnessState, SyncState } from "./realtime.js";

export type TPayRealtimePresentation = Readonly<{
  freshness: FreshnessState;
  sync: SyncState;
  changedFields: readonly string[];
  announcement: string;
  visualDiff: boolean;
  screenFlash: false;
}>;

export function assertRealtimePresentation(model: TPayRealtimePresentation): void {
  if (!model.announcement) throw new Error("Realtime changes require an accessible announcement");
  if (model.screenFlash !== false) throw new Error("Screen-wide flashing is forbidden");
  if (model.sync === "conflict" && model.changedFields.length === 0) {
    throw new Error("Conflict presentation requires affected-field information");
  }
}
