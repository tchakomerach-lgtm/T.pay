import { requestDigest } from "./super-admin-control.js";
export type RedTeamOutcome="BLOCKED"|"ALLOWED"|"ERROR";
export interface RedTeamScenario{name:string;severity:"HIGH"|"CRITICAL";execute:()=>Promise<RedTeamOutcome>}
export interface RedTeamEvidence{scenario:string;outcome:RedTeamOutcome;evidenceDigest:string}
export async function runSuperAdminRedTeam(scenarios:ReadonlyArray<RedTeamScenario>):Promise<RedTeamEvidence[]>{
 const evidence:RedTeamEvidence[]=[];
 for(const s of scenarios){
  let outcome:RedTeamOutcome;
  try{outcome=await s.execute();}catch{outcome="ERROR";}
  evidence.push({scenario:s.name,outcome,evidenceDigest:requestDigest({scenario:s.name,outcome})});
 }
 return evidence;
}
export function assertRedTeamPass(evidence:ReadonlyArray<RedTeamEvidence>){
 const unsafe=evidence.filter(x=>x.outcome==="ALLOWED");
 if(unsafe.length)throw new Error("REDTEAM_CONTROL_BYPASS:"+unsafe.map(x=>x.scenario).join(","));
 if(evidence.some(x=>x.outcome==="ERROR"))throw new Error("REDTEAM_INCONCLUSIVE");
 return true;
}
