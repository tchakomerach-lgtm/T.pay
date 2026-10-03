export type RiskLevel="low"|"medium"|"high"|"critical";
export interface RiskDecision { level:RiskLevel; requiresStepUp:boolean; requiresHumanApproval:boolean; reasonCodes:readonly string[]; }
export function defaultRiskPolicy(operation:string):RiskDecision{
  const high=new Set(["payment.create","payment.withdraw","credit.approve","kyc.override","role.escalate","security.change"]);
  if(high.has(operation)) return {level:"high",requiresStepUp:true,requiresHumanApproval:true,reasonCodes:["HIGH_IMPACT_OPERATION"]};
  return {level:"low",requiresStepUp:false,requiresHumanApproval:false,reasonCodes:[]};
}