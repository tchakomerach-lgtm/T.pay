import { createHmac, timingSafeEqual } from "node:crypto";

export type CursorPayload = {
  v: 1;
  createdAt: string;
  id: string;
  scope: string;
};

function key(secret: string): Buffer {
  if (secret.length < 32) throw new Error("CURSOR_SECRET_TOO_SHORT");
  return Buffer.from(secret, "utf8");
}

export function encodeCursor(payload: Omit<CursorPayload,"v">, secret: string): string {
  const normalized: CursorPayload = {v:1,...payload};
  const body = Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
  const signature = createHmac("sha256", key(secret)).update(body).digest("base64url");
  return body + "." + signature;
}

export function decodeCursor(cursor: string, secret: string, expectedScope: string): CursorPayload {
  if (cursor.length > 512) throw new Error("INVALID_CURSOR");
  const [body, signature] = cursor.split(".");
  if (!body || !signature) throw new Error("INVALID_CURSOR");
  const expected = createHmac("sha256", key(secret)).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a,b)) throw new Error("INVALID_CURSOR");
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(body,"base64url").toString("utf8")); } catch { throw new Error("INVALID_CURSOR"); }
  if (!parsed || typeof parsed !== "object") throw new Error("INVALID_CURSOR");
  const value = parsed as Partial<CursorPayload>;
  if (value.v !== 1 || typeof value.createdAt !== "string" || typeof value.id !== "string" || value.scope !== expectedScope) throw new Error("INVALID_CURSOR");
  const timestamp = Date.parse(value.createdAt);
  if (!Number.isFinite(timestamp)) throw new Error("INVALID_CURSOR");
  return value as CursorPayload;
}
