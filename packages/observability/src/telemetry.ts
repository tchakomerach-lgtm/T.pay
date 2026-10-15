import {sanitizeForExposure} from "../../security/src/fortress-exposure-guard.js";

export interface TelemetryContext {
  serviceName:string;
  traceId:string;
  correlationId:string;
  organizationId?:string;
  actorId?:string;
}
const MAX_TELEMETRY_BYTES=64*1024;

/** Scrubs nested values and free-text fields before logs or trace attributes leave a service. */
export function sanitizeTelemetry(input:Record<string,unknown>):Record<string,unknown>{
  const result=sanitizeForExposure(input,{
    channel:"telemetry",
    purpose:"logs-traces-metrics",
    allowedClasses:["internal"],
    maxBytes:MAX_TELEMETRY_BYTES
  });
  return result.value as Record<string,unknown>;
}

/** Restrict trace identity labels to opaque identifiers and remove PII/credentials. */
export function sanitizeTelemetryContext(input:TelemetryContext):TelemetryContext{
  const safe=sanitizeTelemetry(input as unknown as Record<string,unknown>);
  const opaque=(value:unknown)=>typeof value==="string"&&/^[A-Za-z0-9._:-]{8,128}$/.test(value)?value:undefined;
  const serviceName=typeof safe.serviceName==="string"&&/^[A-Za-z0-9._-]{1,80}$/.test(safe.serviceName)?safe.serviceName:"tpay.unknown";
  return {
    serviceName,
    traceId:opaque(safe.traceId)??"unavailable",
    correlationId:opaque(safe.correlationId)??"unavailable",
    ...(opaque(safe.organizationId)?{organizationId:opaque(safe.organizationId)}:{}),
    ...(opaque(safe.actorId)?{actorId:opaque(safe.actorId)}:{})
  };
}

export function metricName(domain:string,operation:string):string{
  return `tpay.${domain}.${operation}`.toLowerCase().replace(/[^a-z0-9_.-]/g,"_");
}
