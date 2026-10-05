export type VoiceRouteMethod = "POST" | "GET";

export interface VoiceRouteDefinition {
  readonly method: VoiceRouteMethod;
  readonly path: string;
  readonly auth: "session" | "service_signature" | "admin";
  readonly idempotent: boolean;
  readonly mutates: boolean;
  readonly transport: "https-tls13";
}

export const VOICE_ROUTES: readonly VoiceRouteDefinition[] = [
  { method: "POST", path: "/v1/voice/sessions", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/calls/inbound", auth: "service_signature", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/calls/outbound", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/calls/:id/verify", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/calls/:id/confirm", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/calls/:id/handoff", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/calls/:id/terminate", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "GET", path: "/v1/voice/calls/:id", auth: "session", idempotent: false, mutates: false, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/appointments/search", auth: "session", idempotent: false, mutates: false, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/appointments/book", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/appointments/reschedule", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/appointments/cancel", auth: "session", idempotent: true, mutates: true, transport: "https-tls13" },
  { method: "POST", path: "/v1/voice/provider/callback", auth: "service_signature", idempotent: true, mutates: true, transport: "https-tls13" },
];

export function assertVoiceRouteTransport(route: VoiceRouteDefinition): void {
  if (route.transport !== "https-tls13") throw new Error("VOICE_ROUTE_TLS13_REQUIRED");
  if (route.mutates && !route.idempotent) throw new Error("VOICE_MUTATION_IDEMPOTENCY_REQUIRED");
}
