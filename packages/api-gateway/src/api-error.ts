import {safeClientError} from "../../security/src/fortress-exposure-guard.js";

export interface ApiErrorEnvelope{
  status:number;
  code:string;
  correlationId:string;
  retryAfterSeconds?:number;
}

const STATUS_BY_CODE:Record<string,number>={
  API_VERSION_MISSING:400,
  API_VERSION_UNSUPPORTED:404,
  API_VERSION_SUNSET:410,
  API_ROUTE_NOT_ALLOWLISTED:404,
  API_AUTH_INSUFFICIENT:403,
  API_SCOPE_EVIDENCE_MISSING:401,
  API_RATE_LIMITED:429,
  API_RATE_CONTROL_UNAVAILABLE:503,
  FINANCIAL_CORE_DENY_BY_DEFAULT:403,
  API_CORRELATION_ID_INVALID:400,
  API_HEADER_TOO_LARGE:400,
  CONTENT_LENGTH_INVALID:400,
  PAYLOAD_TOO_LARGE:413,
  API_JSON_CONTENT_TYPE_REQUIRED:415,
  API_IDEMPOTENCY_KEY_INVALID:400,
  API_IDEMPOTENCY_CONFLICT:409,
  AUTH_BEARER_REQUIRED:401,
  AUTH_SESSION_INVALID:401,
  AUTH_ACTOR_INVALID:401,
  AUTH_PERMISSIONS_EMPTY:403,
  TENANT_CONTEXT_REQUIRED:403,
  ORGANIZATION_CONTEXT_REQUIRED:403,
  REALTIME_METHOD_NOT_ALLOWED:405,
  REALTIME_NOT_CONFIGURED:503,
  REALTIME_DURABLE_REPLAY_NOT_CONFIGURED:503,
  REALTIME_INVALID_CURSOR:400,
  FORBIDDEN:403,
  TIMEOUT:503,
  ECONNRESET:503,
  "503":503
};

/** Only stable, documented client-safe codes may cross the HTTP trust boundary. */
const PUBLIC_ERROR_CODES=new Set(Object.keys(STATUS_BY_CODE).concat(["API_INTERNAL_ERROR"]));

export function normalizeApiError(error:unknown,correlationId:string):ApiErrorEnvelope{
  const raw=error instanceof Error?error.message:"";
  const candidate=/^[A-Z][A-Z0-9_]{2,80}$/.test(raw)?raw:"";
  const code=PUBLIC_ERROR_CODES.has(candidate)?candidate:"API_INTERNAL_ERROR";
  const status=STATUS_BY_CODE[code]??500;
  const safe=safeClientError(code,correlationId);
  return {status,code:safe.code,correlationId:safe.correlationId};
}
