export interface OrganizationSession {id:string;organizationId:string;userId:string;roleId:string;issuedAt:string;expiresAt:string;revokedAt?:string;}
export function assertSessionActive(s:OrganizationSession,now=new Date()){if(s.revokedAt)throw new Error("ORG_SESSION_REVOKED");if(s.expiresAt<=now.toISOString())throw new Error("ORG_SESSION_EXPIRED");}
export function sessionExpiry(issuedAt:string,ttlSeconds=900){if(ttlSeconds<60||ttlSeconds>3600)throw new Error("ORG_SESSION_TTL_INVALID");return new Date(Date.parse(issuedAt)+ttlSeconds*1000).toISOString();}
