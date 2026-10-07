import type { Pool } from "pg";
import { requestDigest } from "./super-admin-control.js";
export type MaintenanceMode="normal"|"degraded"|"readonly"|"maintenance";
export async function changeMaintenanceAtomically(pool:Pool,input:{expectedVersion:number;mode:MaintenanceMode;actorId:string;reason:string}){
 if(input.reason.trim().length<8)throw new Error("MAINTENANCE_REASON_REQUIRED");
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const row=(await c.query("SELECT mode,version FROM tpay_maintenance_control WHERE singleton_id=1 FOR UPDATE")).rows[0];
  if(!row)throw new Error("MAINTENANCE_CONTROL_MISSING");
  if(Number(row.version)!==input.expectedVersion)throw new Error("MAINTENANCE_VERSION_CONFLICT");
  const digest=requestDigest({mode:input.mode,actorId:input.actorId,reason:input.reason.trim(),expectedVersion:input.expectedVersion});
  const next=Number(row.version)+1;
  await c.query("UPDATE tpay_maintenance_control SET mode=$1,version=$2,updated_by=$3,updated_at=now() WHERE singleton_id=1",[input.mode,next,input.actorId]);
  await c.query("COMMIT");
  return{mode:input.mode,version:next,digest};
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release();}
}
