import https from "node:https";
import type { RequestOptions } from "node:https";

export interface SecureHttpClientOptions {
  readonly endpoint: URL;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
  readonly ca?: string | Buffer;
  readonly cert?: string | Buffer;
  readonly key?: string | Buffer;
}

export interface SecureHttpResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body: string;
}

export function secureHttpsRequest(options: SecureHttpClientOptions): Promise<SecureHttpResponse> {
  if (options.endpoint.protocol !== "https:") return Promise.reject(new Error("SECURE_HTTP_HTTPS_REQUIRED"));
  const requestOptions: RequestOptions = {
    protocol: "https:",
    hostname: options.endpoint.hostname,
    port: options.endpoint.port || 443,
    path: options.endpoint.pathname + options.endpoint.search,
    method: options.method,
    headers: options.headers,
    ca: options.ca,
    cert: options.cert,
    key: options.key,
    minVersion: "TLSv1.3",
    maxVersion: "TLSv1.3",
    rejectUnauthorized: true,
    timeout: options.timeoutMs ?? 10_000,
  };
  return new Promise((resolve, reject) => {
    const request = https.request(requestOptions, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers,
        body,
      }));
    });
    request.on("timeout", () => request.destroy(new Error("SECURE_HTTP_TIMEOUT")));
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}
