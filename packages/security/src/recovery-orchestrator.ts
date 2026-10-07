import type { Pool } from "pg";
import { createHash } from "node:crypto";
export const RECOVERY_PLAN=["TRUST","IDENTITY","SECURITY","LEDGER","PAYMENT","WALLET","CORE_API","ORG_DATA","MEDIA"] as const;
export type RecoveryPlane=typeof RECOVERY_PLAN[number];
export function manifestDigest(manifest:unknown){return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");}
export async function recordCheckpoint(pool:Pool,input:{runId:string;plane:RecoveryPlane;generation:string;manifest:unknown;verified:boolean}){
 const digest=manifestDigest(input.manifest);
 await pool.query(`INSERT INTO tpay_recovery_checkpoints(id,recovery_run_id,plane,source_generation,digest,verified,verified_at)
 VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,CASE WHEN $5 THEN now() ELSE NULL END)
 ON CONFLICT(recovery_run_id,plane,source_generation) DO UPDATE SET digest=EXCLUDED.digest,verified=EXCLUDED.verified,verified_at=EXCLUDED.verified_at`,
 [input.runId,input.plane,input.generation,digest,input.verified]);
 return {plane:input.plane,generation:input.generation,digest,verified:input.verified};
}
export async function canReopenFinancialPlane(pool:Pool,runId:string){
 const rows=await pool.query("SELECT plane,verified FROM tpay_recovery_checkpoints WHERE recovery_run_id=$1",[runId]);
 const map=new Map(rows.rows.map(x=>[String(x.plane),Boolean(x.verified)]));
 return RECOVERY_PLAN.slice(0,5).every(p=>map.get(p)===true);
}
export async function registerImmutableBackup(pool:Pool,input:{runId:string;storageClass:"IMMUTABLE"|"WORM"|"OFFLINE";locationRef:string;manifest:unknown;encrypted:boolean;restoreTested:boolean}){
 if(!input.encrypted||!input.restoreTested)throw new Error("RECOVERY_BACKUP_NOT_CERTIFIED");
 const digest=manifestDigest(input.manifest);
 const r=await pool.query("INSERT INTO tpay_recovery_backup_manifests(id,recovery_run_id,storage_class,location_ref,manifest_digest,encrypted,restore_tested) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6) RETURNING id",[input.runId,input.storageClass,input.locationRef,digest,input.encrypted,input.restoreTested]);
 return {id:String(r.rows[0].id),digest};
}
