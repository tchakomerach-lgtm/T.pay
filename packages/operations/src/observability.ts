import type {PoolClient} from "pg";

const HEX64=/^[a-f0-9]{64}$/;
type Severity="low"|"medium"|"high"|"critical";
export interface Measurement {id:string;service:string;metric:string;value:bigint;observedAt:string;correlationId?:string;evidenceHash:string;}
export interface Alert {id:string;service:string;alertKey:string;severity:Severity;state:"open"|"acknowledged"|"resolved";firstSeenAt:string;lastSeenAt:string;correlationId?:string;evidenceHash:string;}

export class PostgresOperationalObservabilityRepository {
 constructor(private readonly db:Pick<PoolClient,"query">){}
 async recordMeasurement(m:Measurement):Promise<void>{
  if(m.value<0n||!HEX64.test(m.evidenceHash)) throw new Error("OPERATIONAL_MEASUREMENT_INVALID");
  await this.db.query("INSERT INTO operational_measurements(id,service,metric,value,observed_at,correlation_id,evidence_hash) VALUES($1,$2,$3,$4,$5::timestamptz,$6,$7)",[m.id,m.service,m.metric,m.value.toString(),m.observedAt,m.correlationId??null,m.evidenceHash]);
 }
 async upsertAlert(a:Alert):Promise<void>{
  if(!HEX64.test(a.evidenceHash)||!a.service||!a.alertKey) throw new Error("OPERATIONAL_ALERT_INVALID");
  await this.db.query("INSERT INTO operational_alerts(id,service,alert_key,severity,state,first_seen_at,last_seen_at,correlation_id,evidence_hash) VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9) ON CONFLICT(service,alert_key) DO UPDATE SET severity=EXCLUDED.severity,state=EXCLUDED.state,last_seen_at=EXCLUDED.last_seen_at,correlation_id=EXCLUDED.correlation_id,evidence_hash=EXCLUDED.evidence_hash",[a.id,a.service,a.alertKey,a.severity,a.state,a.firstSeenAt,a.lastSeenAt,a.correlationId??null,a.evidenceHash]);
 }
}
