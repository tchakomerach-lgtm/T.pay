export type AuthorizationEffect="allow"|"deny";
export interface AuthorizationContext{
 readonly organizationId:string; readonly actorId:string; readonly agentId:string; readonly roles:readonly string[];
 readonly purpose:string; readonly dataClasses:readonly string[]; readonly requestedAction:string;
}
export interface AuthorizationRule{
 readonly action:string; readonly requiredRoles:readonly string[]; readonly allowedDataClasses:readonly string[];
}
export function evaluateAuthorization(ctx:AuthorizationContext,rule:AuthorizationRule):AuthorizationEffect{
 if(!ctx.organizationId.trim()||!ctx.actorId.trim()||!ctx.agentId.trim()||!ctx.purpose.trim()||!ctx.requestedAction.trim())throw new Error("AUTH_CONTEXT_REQUIRED");
 if(ctx.requestedAction!==rule.action)return"deny";
 if(rule.requiredRoles.length>0&&!rule.requiredRoles.some(r=>ctx.roles.includes(r)))return"deny";
 if(ctx.dataClasses.some(c=>!rule.allowedDataClasses.includes(c)))return"deny";
 return"allow";
}
export function assertAuthorized(ctx:AuthorizationContext,rule:AuthorizationRule):void{
 if(evaluateAuthorization(ctx,rule)!=="allow")throw new Error("AUTHORIZATION_DENIED");
}
