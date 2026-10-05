export type HealthStatus="ok"|"degraded"|"unavailable";
export interface HealthProbe{name:string;check():Promise<boolean>;}
export interface HealthReport{status:HealthStatus;ready:boolean;checks:Record<string,boolean>;timestamp:string;}

export async function runHealthProbes(probes:readonly HealthProbe[],now=new Date().toISOString()):Promise<HealthReport>{
  const checks:Record<string,boolean>={};
  for(const probe of probes){
    try{checks[probe.name]=await probe.check();}catch{checks[probe.name]=false;}
  }
  const values=Object.values(checks);
  const ready=values.length>0&&values.every(Boolean);
  const status=ready?"ok":values.some(Boolean)?"degraded":"unavailable";
  return {status,ready,checks,timestamp:now};
}
