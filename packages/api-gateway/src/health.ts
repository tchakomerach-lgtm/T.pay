export type HealthStatus="ok"|"degraded"|"unavailable";
export interface HealthProbe{name:string;check():Promise<boolean>;}
export interface HealthReport{status:HealthStatus;ready:boolean;checks:Record<string,boolean>;timestamp:string;}

export async function runHealthProbes(
  probes:readonly HealthProbe[],
  now=new Date().toISOString(),
  timeoutMs=1000
):Promise<HealthReport>{
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw new Error("HEALTH_TIMEOUT_INVALID");
  const checks:Record<string,boolean>={};
  for(const probe of probes){
    try{
      checks[probe.name]=await Promise.race([
        probe.check(),
        new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),timeoutMs))
      ]);
    }catch{checks[probe.name]=false;}
  }
  const values=Object.values(checks);
  const ready=values.length>0&&values.every(Boolean);
  const status=ready?"ok":values.some(Boolean)?"degraded":"unavailable";
  return {status,ready,checks,timestamp:now};
}
