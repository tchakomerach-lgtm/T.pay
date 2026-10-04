import type {PoolClient} from "pg";
export interface RecoveryRun {id:string;operation:"backup"|"restore"|"restore_drill";status:"started"|"succeeded"|"failed";artifactRef:string;checksum:string;startedAt:string;completedAt?:string;evidenceHash:string;}
export class PostgresRecoveryEvidenceRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async record(run:RecoveryRun):Promise<void>{
    if(!/^[a-f0-9]{64}$/.test(run.checksum)||!/^[a-f0-9]{64}$/.test(run.evidenceHash)) throw new Error("RECOVERY_EVIDENCE_HASH_INVALID");
    const values=[run.id,run.operation,run.status,run.artifactRef,run.checksum,run.startedAt,run.completedAt??null,run.evidenceHash];
    await this.db.query("INSERT INTO backup_restore_runs (id,operation,status,artifact_ref,checksum,started_at,completed_at,evidence_hash) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8)",values);
  }
}
