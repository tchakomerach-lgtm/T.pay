export type TPayComponentState = Readonly<{
  surface: "default" | "hover" | "focus" | "pressed" | "loading" | "success" | "warning" | "error" | "disabled";
  connectivity: "online" | "offline" | "syncing" | "conflict";
  authorization: "allowed" | "permission-denied";
  reducedMotion: boolean;
}>;

export function assertComponentState(state: TPayComponentState): void {
  if (state.surface === "loading" && state.authorization === "permission-denied") {
    throw new Error("A denied component cannot remain in loading state");
  }
  if (state.surface === "success" && state.connectivity === "offline") {
    throw new Error("Offline UI cannot claim authoritative success");
  }
}
