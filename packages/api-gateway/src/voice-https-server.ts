import { createServer, type Server, type ServerOptions } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { VOICE_ROUTES } from "./voice-routes.js";

export interface VoiceApiPrincipal {
  readonly actorId: string;
  readonly organizationIds: readonly string[];
  readonly scopes: readonly string[];
}

export interface VoiceApiAuth {
  authenticate(request: IncomingMessage): Promise<VoiceApiPrincipal>;
  authorize(principal: VoiceApiPrincipal, method: string, path: string): Promise<void>;
}

export interface VoiceIdempotencyStore {
  get(key: string): Promise<{ statusCode: number; body: string } | undefined>;
  put(key: string, value: { statusCode: number; body: string }): Promise<void>;
}

export interface VoiceHttpsServerOptions {
  readonly tls: {
    readonly key: string | Buffer;
    readonly cert: string | Buffer;
    readonly ca?: string | Buffer;
    readonly requestCert?: boolean;
    readonly rejectUnauthorized?: boolean;
  };
  readonly auth: VoiceApiAuth;
  readonly idempotency: VoiceIdempotencyStore;
  readonly handle: (input: {
    principal: VoiceApiPrincipal;
    request: IncomingMessage;
    body: string;
    requestId: string;
  }) => Promise<{ statusCode: number; body: string }>;
}

/**
 * Concrete HTTPS API boundary. TLS 1.3 is enforced at the socket layer.
 * Certificates are injected at runtime from a secret manager/KMS/HSM-backed
 * deployment; no certificate or private key is persisted in source.
 */
export function createVoiceHttpsServer(options: VoiceHttpsServerOptions): Server {
  const serverOptions: ServerOptions = {
    key: options.tls.key,
    cert: options.tls.cert,
    ...(options.tls.ca === undefined ? {} : { ca: options.tls.ca }),
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    ...(options.tls.requestCert === undefined ? {} : { requestCert: options.tls.requestCert }),
    ...(options.tls.rejectUnauthorized === undefined ? {} : { rejectUnauthorized: options.tls.rejectUnauthorized }),
  };

  return createServer(serverOptions, async (request, response) => {
    const requestId = request.headers["x-request-id"]?.toString() || randomUUID();
    try {
      if (!request.socket.encrypted || request.socket.getProtocol() !== "TLSv1.3") {
        response.writeHead(426, { "content-type": "application/json", "strict-transport-security": "max-age=31536000; includeSubDomains" });
        response.end(JSON.stringify({ error: "TLS13_REQUIRED", requestId }));
        return;
      }

      const method = request.method ?? "GET";
      const path = (request.url ?? "/").split("?")[0];
      const route = VOICE_ROUTES.find(r => r.method === method && r.path === path);
      if (!route) {
        response.writeHead(404, { "content-type": "application/json", "strict-transport-security": "max-age=31536000; includeSubDomains" });
        response.end(JSON.stringify({ error: "VOICE_ROUTE_NOT_FOUND", requestId }));
        return;
      }

      const principal = await options.auth.authenticate(request);
      await options.auth.authorize(principal, method, path);

      let body = "";
      for await (const chunk of request) {
        body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        if (body.length > 1_000_000) throw new Error("VOICE_REQUEST_TOO_LARGE");
      }

      let result: { statusCode: number; body: string };
      if (route.idempotent) {
        const key = request.headers["idempotency-key"]?.toString();
        if (!key || key.length < 16 || key.length > 200) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
        const scopedKey = principal.organizationIds.slice().sort().join(",") + ":" + method + ":" + path + ":" + key;
        const previous = await options.idempotency.get(scopedKey);
        if (previous) result = previous;
        else {
          result = await options.handle({ principal, request, body, requestId });
          await options.idempotency.put(scopedKey, result);
        }
      } else {
        result = await options.handle({ principal, request, body, requestId });
      }

      response.writeHead(result.statusCode, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-request-id": requestId,
      });
      response.end(result.body);
    } catch (error) {
      response.writeHead(403, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "x-request-id": requestId,
      });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "VOICE_REQUEST_REJECTED", requestId }));
    }
  });
}
