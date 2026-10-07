export type PilotGateName="IDENTITY"|"TENANT_ISOLATION"|"API"|"POSTGRES_SYNC"|"REALTIME_REPLAY"|"OFFLINE_STORAGE"|"HTTPS_ADAPTERS"|"AUDIT"|"OBSERVABILITY"|"SECURITY_TESTS"|"BACKUP_RECOVERY";
export type GateStatus="PASS"|"FAIL"|"UNKNOWN";
export type DeploymentMode="BLOCKED"|"CANARY"|"PILOT"|"PRODUCTION";
export interface PilotGate{name:PilotGateName;status:GateStatus;evidence:string;checkedAt:string;}
export interface PilotAssessment{mode:DeploymentMode;ready:boolean;gates:PilotGate[];blocking:GatedFailure[];canaryPercent:number;}
export interface GatedFailure{name:PilotGateName;reason:string;}
const required:PilotGateName[]=["IDENTITY","TENANT_ISOLATION","API","POSTGRES_SYNC","REALTIME_REPLAY","OFFLINE_STORAGE","HTTPS_ADAPTERS","AUDIT","OBSERVABILITY","SECURITY_TESTS","BACKUP_RECOVERY"];
export function assessSchoolPilot(gates:readonly PilotGate[],requested:DeploymentMode,canaryPercent=0):PilotAssessment{
 if(!Number.isInteger(canaryPercent)||canaryPercent<0||canaryPercent>100)throw new Error("PILOT_INVALID_CANARY_PERCENT");
 const map=new Map(gates.map(g=>[g.name,g]));
 const blocking:GatedFailure[]=[];
 for(const name of required){
  const gate=map.get(name);
  if(!gate)blocking.push({name,reason:"GATE_MISSING"});
  else if(gate.status!=="PASS")blocking.push({name,reason:`GATE_${gate.status}`});
 }
 const requestedCanary=requested==="CANARY"||requested==="PILOT"||requested==="PRODUCTION";
 if(requestedCanary&&canaryPercent===0)blocking.push({name:"OBSERVABILITY",reason:"CANARY_PERCENT_REQUIRED"});
 if(requested==="PRODUCTION"&&canaryPercent!==100)blocking.push({name:"OBSERVABILITY",reason:"PRODUCTION_REQUIRES_100_PERCENT"});
 if(blocking.length)return {mode:"BLOCKED",ready:false,gates:[...gates],blocking,canaryPercent};
 return {mode:requested,ready:true,gates:[...gates],blocking:[],canaryPercent};
}
export function assertPilotReady(assessment:PilotAssessment):void{
 if(!assessment.ready||assessment.mode==="BLOCKED")throw new Error("SCHOOL_PILOT_BLOCKED:"+assessment.blocking.map(x=>x.name+"="+x.reason).join(","));
}
export function shouldRouteToCanary(stableKey:string,percent:number):boolean{
 if(!stableKey||!Number.isInteger(percent)||percent<0||percent>100)throw new Error("CANARY_ROUTING_INVALID");
 if(percent===0)return false;if(percent===100)return true;
 let h=0;for(let i=0;i<stableKey.length;i++)h=(h*31+stableKey.charCodeAt(i))>>>0;
 return h%100<percent;
}
