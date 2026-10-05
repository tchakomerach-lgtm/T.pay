import type { TPayActionContract } from "./actions.js";

export type TPaySyncPresentation = Readonly<{
  connection: "online" | "reconnecting" | "offline";
  queuedCount: number;
  conflictCount: number;
  lastAuthoritativeSyncAt?: string;
  action: TPayActionContract;
  localOutcome: "not-started" | "queued" | "locally-saved" | "requires-reconnect" | "conflict";
}>;

export function assertSyncPresentation(model: TPaySyncPresentation): void {
  if (model.queuedCount < 0 || model.conflictCount < 0) throw new Error("Sync counters cannot be negative");
  if (model.localOutcome === "locally-saved" && model.connection === "online" && !model.lastAuthoritativeSyncAt) {
    throw new Error("Online locally-saved state requires authoritative sync evidence");
  }
  if (model.localOutcome === "conflict" && model.conflictCount === 0) {
    throw new Error("Conflict outcome requires a conflict count");
  }
}