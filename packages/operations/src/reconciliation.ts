import type {PoolClient} from "pg";

const HEX64=/^[a-f0-9]{64}$/;

export interface ReconciliationRun {
  id:string; scope:"ledger"|"provider"|"offline"|"cash"|"notifications"|"full";
  status:"started"|"succeeded"|"failed"|"quarantined"; correlationId:string;
  startedAt:string; completedAt?:string; mismatchCount:bigint; evidenceHash:string;
}
export interface ReconciliationException {
  id:string; runId:string; organizationId?:string; exceptionKey:string;
  severity:"low"|"medium"|"high"|"critical"; state:"open"|"quarantined"|"resolved";
  evidenceHash:string; detectedAt:string; resolvedAt?:string;
}
export interface RecoveryDrill {
  id:string; environment:string; scenario:"restore"|"failover"|"provider_outage"|"region_loss";
  status:"planned"|"running"|"succeeded"|"failed"|"aborted";
  rpoTargetSeconds:bigint; rtoTargetSeconds:bigint;
  observedRpoSeconds?:bigint; observedRtoSeconds?:bigint;
  evidenceHash:string; startedAt:string; completedAt?:string;
}

export class PostgresOperationalReconciliationRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async recordRun(r:ReconciliationRun):Promise<void>{
    if(!r.correlationId||r.mismatchCount<0n||!HEX64.test(r.evidenceHash)) throw new Error("RECONCILIATION_RUN_INVALID");
    await this.db.query(
      "INSERT INTO operational_reconciliation_runs(id,scope,status,correlation_id,started_at,completed_at,mismatch_count,evidence_hash) VALUES($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8)",
      [r.id,r.scope,r.status,r.correlationId,r.startedAt,r.completedAt??null,r.mismatchCount.toString(),r.evidenceHash]
    );
  }
  async recordException(e:ReconciliationException):Promise<void>{
    if(!e.exceptionKey||!HEX64.test(e.evidenceHash)) throw new Error("RECONCILIATION_EXCEPTION_INVALID");
    await this.db.query(
      "INSERT INTO operational_reconciliation_exceptions(id,run_id,organization_id,exception_key,severity,state,evidence_hash,detected_at,resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz) ON CONFLICT(run_id,exception_key) DO UPDATE SET severity=EXCLUDED.severity,state=EXCLUDED.state,evidence_hash=EXCLUDED.evidence_hash,resolved_at=EXCLUDED.resolved_at",
      [e.id,e.runId,e.organizationId??null,e.exceptionKey,e.severity,e.state,e.evidenceHash,e.detectedAt,e.resolvedAt??null]
    );
  }
  async recordDrill(d:RecoveryDrill):Promise<void>{
    if(d.rpoTargetSeconds<0n||d.rtoTargetSeconds<0n||!HEX64.test(d.evidenceHash)) throw new Error("DR_DRILL_INVALID");
    await this.db.query(
      "INSERT INTO disaster_recovery_drills(id,environment,scenario,status,rpo_target_seconds,rto_target_seconds,observed_rpo_seconds,observed_rto_seconds,evidence_hash,started_at,completed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz)",
      [d.id,d.environment,d.scenario,d.status,d.rpoTargetSeconds.toString(),d.rtoTargetSeconds.toString(),d.observedRpoSeconds?.toString()??null,d.observedRtoSeconds?.toString()??null,d.evidenceHash,d.startedAt,d.completedAt??null]
    );
  }
}
