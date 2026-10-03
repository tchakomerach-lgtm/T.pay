export interface TelemetryContext {
  serviceName:string;
  traceId:string;
  correlationId:string;
  organizationId?:string;
  actorId?:string;
}
export function sanitizeTelemetry(input:Record<string,unknown>):Record<string,unknown>{
  const sensitive=/password|secret|token|authorization|cookie|kyc|document|pin|otp|card|account/i;
  return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,sensitive.test(k)?"[REDACTED]":v]));
}
export function metricName(domain:string,operation:string):string{
  return `tpay.${domain}.${operation}`.toLowerCase().replace(/[^a-z0-9_.-]/g,"_");
}