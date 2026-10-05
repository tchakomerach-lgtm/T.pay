import { isIP } from "node:net";

export type TransportProtocol = "https" | "http3" | "wss" | "webrtc" | "sip-tls";

export interface SecureTransportPolicy {
  readonly minimumTlsVersion: "TLSv1.3";
  readonly allowTls12Compatibility: boolean;
  readonly requireHsts: boolean;
  readonly allowHttpRedirect: false;
  readonly allowPrivateIpLiterals: false;
  readonly allowedHosts: readonly string[];
  readonly requireMutualTls: boolean;
  readonly maxClockSkewSeconds: number;
}

const PRIVATE_V4 = (host: string) => {
  const p = host.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = p;
  return a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

function privateIp(host: string): boolean {
  const v = isIP(host);
  if (v === 4) return PRIVATE_V4(host);
  if (v === 6) {
    const h = host.toLowerCase();
    return h === "::1" || h.startsWith("fc") || h.startsWith("fd") ||
      h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb");
  }
  return false;
}

export function assertSecureOutboundUrl(
  endpoint: string,
  policy: Pick<SecureTransportPolicy, "allowedHosts" | "allowPrivateIpLiterals">,
): URL {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("SECURE_TRANSPORT_URL_INVALID"); }
  if (url.protocol !== "https:") throw new Error("SECURE_TRANSPORT_HTTPS_REQUIRED");
  if (url.username || url.password || url.hash) throw new Error("SECURE_TRANSPORT_URL_CREDENTIALS_OR_FRAGMENT_FORBIDDEN");
  if (!policy.allowPrivateIpLiterals && privateIp(url.hostname)) {
    throw new Error("SECURE_TRANSPORT_PRIVATE_IP_FORBIDDEN");
  }
  if (!policy.allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error("SECURE_TRANSPORT_HOST_NOT_ALLOWLISTED");
  }
  return url;
}

export function assertSecureTransportPolicy(policy: SecureTransportPolicy): void {
  if (policy.minimumTlsVersion !== "TLSv1.3") throw new Error("SECURE_TRANSPORT_TLS13_REQUIRED");
  if (policy.allowTls12Compatibility) throw new Error("SECURE_TRANSPORT_TLS12_NOT_ALLOWED_ON_PRIMARY_ENDPOINT");
  if (!policy.requireHsts || policy.allowHttpRedirect) throw new Error("SECURE_TRANSPORT_HSTS_REQUIRED");
  if (policy.requireMutualTls && policy.maxClockSkewSeconds > 300) {
    throw new Error("SECURE_TRANSPORT_CLOCK_SKEW_TOO_LARGE");
  }
  if (policy.maxClockSkewSeconds < 1 || policy.maxClockSkewSeconds > 300) {
    throw new Error("SECURE_TRANSPORT_CLOCK_SKEW_INVALID");
  }
}

/**
 * HTTP/3 is an optimization, never a security downgrade. HTTP/3 uses QUIC/TLS 1.3;
 * fallback is allowed only to HTTPS/TLS 1.3, never cleartext HTTP.
 */
export function selectSecureProtocol(preferred: "http3" | "https", http3Available: boolean): "http3" | "https" {
  if (preferred === "http3" && http3Available) return "http3";
  return "https";
}

export function assertSecureWebSocketUrl(endpoint: string, allowedHosts: readonly string[]): URL {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error("SECURE_WSS_URL_INVALID"); }
  if (url.protocol !== "wss:") throw new Error("SECURE_WSS_REQUIRED");
  if (!allowedHosts.includes(url.hostname.toLowerCase())) throw new Error("SECURE_WSS_HOST_NOT_ALLOWLISTED");
  return url;
}
