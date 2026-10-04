const HEX64=/^[a-f0-9]{64}$/;
const SECRET_REF=/^[A-Za-z0-9._:/-]{1,200}$/;

export interface SecretRotationEvidence {
  id:string; secretRef:string; version:string; materialDigest:string;
  status:"started"|"succeeded"|"failed"|"rolled_back"; startedAt:string;
  completedAt?:string; evidenceHash:string;
}

interface QueryResultRow { [key:string]: unknown }
export interface DbQuery {
  query(sql:string, values?:unknown[]):Promise<{rows:QueryResultRow[];rowCount:number|null}>;
}
export class PostgresProductionOpsRepository {
  constructor(private readonly db:DbQuery){}

  async recordSecretRotation(e:SecretRotationEvidence):Promise<void>{
    if(!SECRET_REF.test(e.secretRef)||e.version.length<1||e.version.length>100) throw new Error("SECRET_ROTATION_REFERENCE_INVALID");
    if(!HEX64.test(e.materialDigest)||!HEX64.test(e.evidenceHash)) throw new Error("SECRET_ROTATION_HASH_INVALID");
    await this.db.query(
      "INSERT INTO secret_rotation_events (id,secret_ref,version,material_digest,status,started_at,completed_at,evidence_hash) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8)",
      [e.id,e.secretRef,e.version,e.materialDigest,e.status,e.startedAt,e.completedAt??null,e.evidenceHash]
    );
  }

  async acquireDeploymentLock(lockName:string,ownerId:string,leaseUntil:string,acquiredAt:string):Promise<boolean>{
    if(!lockName||!ownerId) throw new Error("DEPLOYMENT_LOCK_REFERENCE_INVALID");
    const sql="INSERT INTO deployment_locks(lock_name,owner_id,lease_until,acquired_at) VALUES($1,$2,$3::timestamptz,$4::timestamptz) ON CONFLICT(lock_name) DO UPDATE SET owner_id=EXCLUDED.owner_id,lease_until=EXCLUDED.lease_until,acquired_at=EXCLUDED.acquired_at WHERE deployment_locks.lease_until <= EXCLUDED.acquired_at RETURNING true AS acquired";
    const r=await this.db.query(sql,[lockName,ownerId,leaseUntil,acquiredAt]);
    return r.rows.length===1;
  }

  async releaseDeploymentLock(lockName:string,ownerId:string):Promise<boolean>{
    const r=await this.db.query("DELETE FROM deployment_locks WHERE lock_name=$1 AND owner_id=$2",[lockName,ownerId]);
    return (r.rowCount??0)===1;
  }

  async recordIncidentDelivery(e:{id:string;routeId:string;incidentId:string;deliveryKey:string;status:"queued"|"sent"|"failed"|"suppressed";attemptedAt:string;evidenceHash:string;}):Promise<void>{
    if(!e.deliveryKey||e.deliveryKey.length>300||!HEX64.test(e.evidenceHash)) throw new Error("INCIDENT_EVIDENCE_INVALID");
    await this.db.query("INSERT INTO incident_delivery_evidence (id,route_id,incident_id,delivery_key,status,attempted_at,evidence_hash) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7)",[e.id,e.routeId,e.incidentId,e.deliveryKey,e.status,e.attemptedAt,e.evidenceHash]);
  }
}
