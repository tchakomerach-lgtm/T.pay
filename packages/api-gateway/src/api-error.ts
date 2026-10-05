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
  FINANCIAL_CORE_DENY_BY_DEFAULT:403
};

export function normalizeApiError(error:unknown,correlationId:string):ApiErrorEnvelope{
  const raw=error instanceof Error?error.message:"";
  const code=/^[A-Z][A-Z0-9_]{2,80}$/.test(raw)?raw:"API_INTERNAL_ERROR";
  const status=STATUS_BY_CODE[code]??(code==="TIMEOUT"||code==="ECONNRESET"||code==="503"?503:500);
  return {status,code,correlationId};
}
