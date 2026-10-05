import type { TPayComponentState } from "./component-state.js";

export type RendererConnection = "online" | "reconnecting" | "offline";
export type RendererLoadState = "idle" | "loading" | "ready" | "empty" | "error";
export type RendererDensity = "comfortable" | "compact";
export type RendererViewport = "mobile" | "tablet" | "desktop";

export type TPayRendererRuntime = Readonly<{
  connection: RendererConnection;
  load: RendererLoadState;
  density: RendererDensity;
  viewport: RendererViewport;
  reducedMotion: boolean;
  queuedActions: number;
  conflicts: number;
}>;

export function assertRendererRuntime(runtime: TPayRendererRuntime): void {
  if (runtime.queuedActions < 0 || runtime.conflicts < 0) {
    throw new Error("Renderer counters cannot be negative");
  }
  if (runtime.connection === "offline" && runtime.load === "loading") {
    throw new Error("Offline renderer cannot remain in remote loading state");
  }
  if (runtime.conflicts > 0 && runtime.connection === "online" && runtime.load === "ready") {
    // Valid: the UI can be online while resolving an existing conflict.
  }
}

export function deriveViewport(width: number): RendererViewport {
  if (!Number.isFinite(width) || width <= 0) throw new Error("Viewport width must be positive");
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function deriveDensity(viewport: RendererViewport, fieldMode: "standard" | "low-bandwidth" | "offline"): RendererDensity {
  if (fieldMode !== "standard" || viewport === "mobile") return "compact";
  return "comfortable";
}

export function assertComponentStateCompatibility(state: TPayComponentState, runtime: TPayRendererRuntime): void {
  if (runtime.connection === "offline" && state.surface === "loading") {
    throw new Error("Offline runtime cannot render a remote loading state");
  }
  if (runtime.reducedMotion && state.reducedMotion === false) {
    throw new Error("Reduced-motion runtime requires reduced-motion-safe component state");
  }
}
