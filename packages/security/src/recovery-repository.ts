import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { requestDigest, transitionRecovery, type RecoveryState } from "./super-admin-control.js";
const allowed=(from:RecoveryState,to:RecoveryState)=>{try{transitionRecovery({id:"x",incidentId:"i",state:from,startedAt:0,lastTransitionAt:0,evidenceDigest:"0".repeat(64)},to,1);return true}catch{return false}};
export async function transitionRecoveryAtomically(pool:Pool,input:{runId:string;actorId?:string;next:RecoveryState;evidence:unknown}){
 const c=await pool.connect();try{await c.query("BEGIN");
 const row=(await c.query("SELECT state,last_transition_at FROM tpay_recovery_runs WHERE id=$1 FOR UPDATE",[input.runId])).rows[0];
 if(!row)throw new Error("RECOVERY_RUN_NOT_FOUND");
 const from=String(row.state) as RecoveryState;if(!allowed(from,input.next))throw new Error("RECOVERY_INVALID_TRANSITION:"+from+":"+input.next);
 const digest=requestDigest(input.evidence);const key=requestDigest({runId:input.runId,from,to:input.next,evidenceDigest:digest});
 await c.query("UPDATE tpay_recovery_runs SET state=$2,last_transition_at=now() WHERE id=$1",[input.runId,input.next]);
 await c.query("INSERT INTO tpay_recovery_transitions(id,recovery_run_id,from_state,to_state,actor_id,evidence_digest,transition_key) VALUES($1,$2,$3,$4,$5,$6,$7)",[randomUUID(),input.runId,from,input.next,input.actorId??null,digest,key]);
 await c.query("COMMIT");return{from,to:input.next,digest};
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release();}
}
