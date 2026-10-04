const HEX64=/^[a-f0-9]{64}$/;
export type ReconciliationStatus="queued"|"running"|"quarantined"|"resolved"|"failed";
export type ReconciliationScope="provider"|"offline"|"cash"|"ledger"|"settlement";
export interface ReconciliationJob {id:string;organizationId:string;idempotencyKey:string;scopeType:ReconciliationScope;scopeRef:string;status:ReconciliationStatus;attemptCount:bigint;nextAttemptAt:string;lastErrorClass?:string;correlationId?:string;evidenceHash:string;createdAt:string;updatedAt:string;}
export interface DrState {service:string;state:"healthy"|"degraded"|"failover_pending"|"failed_over"|"recovery_pending";epoch:bigint;changedAt:string;correlationId?:string;evidenceHash:string;}
interface Row {[key:string]:unknown}
export interface OperationalDb {query(sql:string,values?:unknown[]):Promise<{rows:Row[];rowCount:number|null}>;}
export class PostgresOperationalRecoveryRepository {
 constructor(private readonly db:OperationalDb){}
 async enqueueReconciliation(j:ReconciliationJob):Promise<boolean>{
  if(!j.organizationId||!j.idempotencyKey||!j.scopeRef||j.attemptCount<0n||!HEX64.test(j.evidenceHash)) throw new Error("RECONCILIATION_JOB_INVALID");
  const r=await this.db.query("INSERT INTO operational_reconciliation_jobs(id,organization_id,idempotency_key,scope_type,scope_ref,status,attempt_count,next_attempt_at,last_error_class,correlation_id,evidence_hash,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10,$11,$12::timestamptz,$13::timestamptz) ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING id",[j.id,j.organizationId,j.idempotencyKey,j.scopeType,j.scopeRef,j.status,j.attemptCount.toString(),j.nextAttemptAt,j.lastErrorClass??null,j.correlationId??null,j.evidenceHash,j.createdAt,j.updatedAt]);
  return r.rows.length===1;
 }
 async claimDue(organizationId:string,workerId:string,now:string):Promise<string|undefined>{
  const r=await this.db.query("WITH candidate AS (SELECT id FROM operational_reconciliation_jobs WHERE organization_id=$1 AND status='queued' AND next_attempt_at <= $3::timestamptz ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE operational_reconciliation_jobs j SET status='running',attempt_count=j.attempt_count+1,updated_at=$3::timestamptz,last_error_class=NULL,correlation_id=$2 WHERE j.id IN (SELECT id FROM candidate) RETURNING j.id",[organizationId,workerId,now]);
  return r.rows[0]?.id as string|undefined;
 }
 async transition(id:string,from:ReconciliationStatus,to:ReconciliationStatus,updatedAt:string,errorClass?:string):Promise<boolean>{
  const r=await this.db.query("UPDATE operational_reconciliation_jobs SET status=$3,updated_at=$4::timestamptz,last_error_class=$5 WHERE id=$1 AND status=$2",[id,from,to,updatedAt,errorClass??null]);
  return (r.rowCount??0)===1;
 }
 async setDrState(s:DrState):Promise<void>{
  if(s.epoch<0n||!HEX64.test(s.evidenceHash)) throw new Error("DR_STATE_INVALID");
  await this.db.query("INSERT INTO operational_dr_states(service,state,epoch,changed_at,correlation_id,evidence_hash) VALUES($1,$2,$3,$4::timestamptz,$5,$6) ON CONFLICT(service) DO UPDATE SET state=EXCLUDED.state,epoch=EXCLUDED.epoch,changed_at=EXCLUDED.changed_at,correlation_id=EXCLUDED.correlation_id,evidence_hash=EXCLUDED.evidence_hash WHERE operational_dr_states.epoch <= EXCLUDED.epoch",[s.service,s.state,s.epoch.toString(),s.changedAt,s.correlationId??null,s.evidenceHash]);
 }
}