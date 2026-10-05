export type TPayPrimaryDestination =
  | "home" | "organizations" | "social" | "opportunities"
  | "community-tontine" | "wallet" | "notifications" | "search" | "command-center" | "settings";

export type TPayShellModel = Readonly<{
  activeContextId: string;
  primaryDestination: TPayPrimaryDestination;
  destinations: readonly TPayPrimaryDestination[];
  unreadNotifications: number;
  pendingActions: number;
  connection: "online" | "reconnecting" | "offline";
}>;

const requiredDestinations: readonly TPayPrimaryDestination[] = [
  "home", "organizations", "social", "opportunities", "community-tontine",
  "wallet", "notifications", "search", "command-center", "settings",
];

export function assertShellModel(model: TPayShellModel): void {
  if (!model.activeContextId) throw new Error("Shell requires an active context");
  if (model.unreadNotifications < 0 || model.pendingActions < 0) {
    throw new Error("Shell counters cannot be negative");
  }
  for (const destination of requiredDestinations) {
    if (!model.destinations.includes(destination)) {
      throw new Error(`Shell is missing required destination: ${destination}`);
    }
  }
  if (model.connection === "offline" && model.pendingActions < 0) {
    throw new Error("Offline shell cannot expose invalid pending action count");
  }
}
