import {assertApiVersionCompatibility} from "./api-version.js";
import {normalizeApiError,type ApiErrorEnvelope} from "./api-error.js";

export interface ApiSuccess<T>{
  ok:true;
  version:string;
  correlationId:string;
  data:T;
}

export function buildApiSuccess<T>(version:string,correlationId:string,data:T):ApiSuccess<T>{
  if(!/^v[0-9]+$/.test(version))throw new Error("API_VERSION_INVALID");
  if(correlationId.length<8||correlationId.length>200)throw new Error("API_CORRELATION_INVALID");
  return {ok:true,version,correlationId,data};
}

export function validateContractRoute(route:string):void{
  assertApiVersionCompatibility(route);
}

export function buildApiError(error:unknown,correlationId:string):ApiErrorEnvelope{
  return normalizeApiError(error,correlationId);
}
