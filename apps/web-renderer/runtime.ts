import { useEffect, useState } from "react";
import { deriveDensity, deriveViewport, type RendererConnection, type RendererViewport } from "../design/renderer-quality.js";

export function useTpayBrowserRuntime(fieldMode: "standard" | "low-bandwidth" | "offline") {
  const [viewport, setViewport] = useState<RendererViewport>(() => deriveViewport(window.innerWidth));
  const [connection, setConnection] = useState<RendererConnection>(() => navigator.onLine ? "online" : "offline");
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const onResize = () => setViewport(deriveViewport(window.innerWidth));
    const onOnline = () => setConnection("online");
    const onOffline = () => setConnection("offline");
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(media.matches);

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    media.addEventListener("change", onMotion);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      media.removeEventListener("change", onMotion);
    };
  }, []);

  const effectiveConnection = fieldMode === "offline" ? "offline" : connection;
  return {
    viewport,
    connection: effectiveConnection,
    reducedMotion,
    density: deriveDensity(viewport, fieldMode),
  };
}
