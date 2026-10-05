export type AuthorizationEffect="allow"|"deny";
export type ActorStatus="active"|"suspended"|"locked"|"pending";
export type DeviceTrust="unknown"|"untrusted"|"trusted";

export interface AuthorizationContext{
 readonly organizationId:string; readonly actorId:string; readonly agentId:string; readonly roles:readonly string[];
 readonly purpose:string; readonly dataClasses:readonly string[]; readonly requestedAction:string;
 readonly resourceOrganizationId?:string;
 readonly actorStatus?:ActorStatus;
 readonly deviceTrust?:DeviceTrust;
 readonly sessionAgeMs?:number;
 readonly policyVersion?:string;
}
export interface AuthorizationRule{
 readonly action:string; readonly requiredRoles:readonly string[]; readonly allowedDataClasses:readonly string[];
 readonly requiredPurpose?:string;
 readonly requireActiveActor?:boolean;
 readonly requireTrustedDevice?:boolean;
 readonly maxSessionAgeMs?:number;
 readonly policyVersion?:string;
}
export function evaluateAuthorization(ctx:AuthorizationContext,rule:AuthorizationRule):AuthorizationEffect{
 if(!ctx.organizationId.trim()||!ctx.actorId.trim()||!ctx.agentId.trim()||!ctx.purpose.trim()||!ctx.requestedAction.trim())throw new Error("AUTH_CONTEXT_REQUIRED");
 if(ctx.resourceOrganizationId!==undefined&&ctx.resourceOrganizationId!==ctx.organizationId)return"deny";
 if(ctx.requestedAction!==rule.action)return"deny";
 if(rule.requiredRoles.length>0&&!rule.requiredRoles.some(r=>ctx.roles.includes(r)))return"deny";
 if(ctx.dataClasses.length===0||ctx.dataClasses.some(c=>!rule.allowedDataClasses.includes(c)))return"deny";
 if(rule.requiredPurpose!==undefined&&ctx.purpose!==rule.requiredPurpose)return"deny";
 if(rule.requireActiveActor&&ctx.actorStatus!=="active")return"deny";
 if(rule.requireTrustedDevice&&ctx.deviceTrust!=="trusted")return"deny";
 if(rule.maxSessionAgeMs!==undefined&&(!Number.isSafeInteger(ctx.sessionAgeMs)||ctx.sessionAgeMs<0||ctx.sessionAgeMs>rule.maxSessionAgeMs))return"deny";
 if(rule.policyVersion!==undefined&&ctx.policyVersion!==rule.policyVersion)return"deny";
 return"allow";
}
export function assertAuthorized(ctx:AuthorizationContext,rule:AuthorizationRule):void{
 if(evaluateAuthorization(ctx,rule)!=="allow")throw new Error("AUTHORIZATION_DENIED");
}
