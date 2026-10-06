export type RuntimeMode = "normal" | "degraded" | "readonly" | "maintenance";

export type RuntimeModeDecision = {
  allowed: boolean;
  status: 200 | 423 | 429 | 503;
  code: string;
  retryAfterSeconds?: number;
};

const safeModes = new Set<RuntimeMode>(["normal","degraded","readonly","maintenance"]);

export function resolveRuntimeMode(value = process.env.TPAY_RUNTIME_MODE): RuntimeMode {
  const mode = (value ?? "normal").trim().toLowerCase() as RuntimeMode;
  return safeModes.has(mode) ? mode : "normal";
}

export function evaluateRuntimeMode(mode: RuntimeMode, method: string, pathname: string): RuntimeModeDecision {
  if (mode === "normal") return {allowed:true,status:200,code:"OK"};

  const read = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const health = pathname === "/v1/health";
  const metrics = pathname === "/v1/metrics";

  if (health || metrics) return {allowed:true,status:200,code:"OK"};
  if (mode === "readonly" && read) return {allowed:true,status:200,code:"OK"};
  if (mode === "degraded" && read) return {allowed:true,status:200,code:"OK"};

  if (mode === "maintenance") return {allowed:false,status:503,code:"RUNTIME_MAINTENANCE",retryAfterSeconds:60};
  if (mode === "readonly") return {allowed:false,status:423,code:"RUNTIME_READONLY"};
  return {allowed:false,status:503,code:"RUNTIME_DEGRADED",retryAfterSeconds:15};
}
