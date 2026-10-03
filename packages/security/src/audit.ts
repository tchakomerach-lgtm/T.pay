export type AuditOutcome="allowed"|"denied"|"failed";
export interface AuditEvent {
  id:string; occurredAt:string; actorId:string; sessionId:string; organizationId?:string;
  action:string; resource:string; resourceId?:string; outcome:AuditOutcome;
  reasonCode?:string; correlationId:string;
}
export interface AuditSink { append(event:AuditEvent):Promise<void>; }
export function assertAuditSafe(event:AuditEvent):void{
  if(!event.actorId||!event.sessionId||!event.action||!event.resource||!event.correlationId) throw new Error("INVALID_AUDIT_EVENT");
}