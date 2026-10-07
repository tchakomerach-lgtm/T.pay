import { metricName, sanitizeTelemetry, type TelemetryContext } from "../../observability/src/telemetry.js";

export type SchoolRealtimeHealth="CONNECTED"|"DEGRADED"|"DISCONNECTED"|"RESYNC_REQUIRED"|"UNKNOWN";
export type SchoolObservation={
  operation:string;outcome:"accepted"|"rejected"|"unknown"|"error";durationMs:number;
  freshnessMs:number|null;confidence:number|null;queueDepth:number;eventLagMs:number|null;
  realtimeHealth:SchoolRealtimeHealth;syncState:"HEALTHY"|"PENDING"|"CONFLICTED"|"UNKNOWN";
};

export function schoolMetric(domain:string,operation:string):string{
  return metricName(`education.${domain}`,operation);
}
export function schoolTelemetry(context:TelemetryContext,observation:SchoolObservation):Record<string,unknown>{
  if(!Number.isFinite(observation.durationMs)||observation.durationMs<0)throw new Error("SCHOOL_TELEMETRY_DURATION_INVALID");
  if(observation.queueDepth<0||!Number.isInteger(observation.queueDepth))throw new Error("SCHOOL_TELEMETRY_QUEUE_INVALID");
  if(observation.confidence!==null&&(observation.confidence<0||observation.confidence>1))throw new Error("SCHOOL_TELEMETRY_CONFIDENCE_INVALID");
  const raw={
    service_name:context.serviceName,trace_id:context.traceId,correlation_id:context.correlationId,
    organization_id:context.organizationId,actor_id:context.actorId,
    operation:observation.operation,outcome:observation.outcome,duration_ms:observation.durationMs,
    freshness_ms:observation.freshnessMs,confidence:observation.confidence,queue_depth:observation.queueDepth,
    event_lag_ms:observation.eventLagMs,realtime_health:observation.realtimeHealth,sync_state:observation.syncState
  };
  return sanitizeTelemetry(raw);
}
