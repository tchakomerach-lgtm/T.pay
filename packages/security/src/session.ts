export interface OrganizationSession {
  sessionId:string;
  userId:string;
  organizationId:string;
  createdAt:number;
  expiresAt:number;
  assurance:"standard"|"step_up";
  revokedAt?:number;
}
export function assertSessionActive(session:OrganizationSession, now=Date.now()):void{
  if(session.revokedAt!==undefined) throw new Error("SESSION_REVOKED");
  if(now>=session.expiresAt) throw new Error("SESSION_EXPIRED");
}
export function assertSessionOrganization(session:OrganizationSession, organizationId:string):void{
  if(session.organizationId!==organizationId) throw new Error("ORGANIZATION_SESSION_MISMATCH");
}