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
  const traceId=opaque(safe.traceId)??"unavailable";
  const correlationId=opaque(safe.correlationId)??"unavailable";
  const organizationId=opaque(safe.organizationId);
  const actorId=opaque(safe.actorId);
  return {
    serviceName,
    traceId,
    correlationId,
    ...(organizationId===undefined?{}:{organizationId}),
    ...(actorId===undefined?{}:{actorId})
  };
}

export function metricName(domain:string,operation:string):string{
  const safe=sanitizeForExposure({domain,operation},{channel:"telemetry",purpose:"metric-dimension",allowedClasses:["internal"],maxBytes:1024});
  if(safe.redactedPaths.length>0)return "tpay.unknown.unknown";
  const dimension=(value:unknown)=>typeof value==="string"&&/^[a-z][a-z0-9_.-]{0,40}$/i.test(value)?value.toLowerCase():"unknown";
  const values=safe.value as {domain:unknown;operation:unknown};
  return `tpay.${dimension(values.domain)}.${dimension(values.operation)}`;
}


export interface SafeTelemetrySink {
  emit(record:Readonly<Record<string,unknown>>):Promise<void>|void;
}

/** The only supported path for forwarding structured diagnostics to a log/trace sink. */
export async function emitSafeTelemetry(sink:SafeTelemetrySink,event:Record<string,unknown>):Promise<void>{
  const safe=Object.freeze(sanitizeTelemetry(event));
  await sink.emit(safe);
}
