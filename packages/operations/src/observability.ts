const HEX64=/^[a-f0-9]{64}$/;
type Severity="low"|"medium"|"high"|"critical";
type AlertState="open"|"acknowledged"|"resolved";
type DeliveryStatus="queued"|"sent"|"failed"|"suppressed";
type Channel="email"|"sms"|"webhook"|"pager"|"internal_queue";
interface QueryResultRow { [key:string]: unknown }
export interface DbQuery { query(sql:string, values?:unknown[]):Promise<{rows:QueryResultRow[];rowCount:number|null}>; }

export interface Measurement {id:string;service:string;metric:string;value:bigint;observedAt:string;correlationId?:string;evidenceHash:string;}
export interface Alert {id:string;service:string;alertKey:string;severity:Severity;state:AlertState;firstSeenAt:string;lastSeenAt:string;correlationId?:string;evidenceHash:string;}
export interface AlertDelivery {id:string;service:string;alertKey:string;routeId:string;deliveryKey:string;channel:Channel;status:DeliveryStatus;attemptedAt:string;correlationId?:string;evidenceHash:string;}
export interface DegradedDrill {id:string;service:string;dependency:string;mode:"healthy"|"degraded"|"offline"|"recovered";startedAt:string;endedAt?:string;correlationId:string;evidenceHash:string;}

export class PostgresOperationalObservabilityRepository {
 constructor(private readonly db:DbQuery){}
 async recordMeasurement(m:Measurement):Promise<void>{
  if(m.value<0n||!HEX64.test(m.evidenceHash)||m.service.length>120||m.metric.length>160) throw new Error("OPERATIONAL_MEASUREMENT_INVALID");
  await this.db.query("INSERT INTO operational_measurements(id,service,metric,value,observed_at,correlation_id,evidence_hash) VALUES($1,$2,$3,$4,$5::timestamptz,$6,$7)",[m.id,m.service,m.metric,m.value.toString(),m.observedAt,m.correlationId??null,m.evidenceHash]);
 }
 async upsertAlert(a:Alert):Promise<void>{
  if(!HEX64.test(a.evidenceHash)||!a.service||!a.alertKey||a.service.length>120||a.alertKey.length>240) throw new Error("OPERATIONAL_ALERT_INVALID");
  await this.db.query("INSERT INTO operational_alerts(id,service,alert_key,severity,state,first_seen_at,last_seen_at,correlation_id,evidence_hash) VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9) ON CONFLICT(service,alert_key) DO UPDATE SET severity=EXCLUDED.severity,state=EXCLUDED.state,last_seen_at=EXCLUDED.last_seen_at,correlation_id=EXCLUDED.correlation_id,evidence_hash=EXCLUDED.evidence_hash",[a.id,a.service,a.alertKey,a.severity,a.state,a.firstSeenAt,a.lastSeenAt,a.correlationId??null,a.evidenceHash]);
 }
 async queueAlertDelivery(d:AlertDelivery):Promise<void>{
  if(!d.service||!d.alertKey||!d.deliveryKey||d.deliveryKey.length>300||!HEX64.test(d.evidenceHash)) throw new Error("OPERATIONAL_DELIVERY_INVALID");
  await this.db.query("INSERT INTO operational_alert_deliveries(id,service,alert_key,route_id,delivery_key,channel,status,attempted_at,correlation_id,evidence_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10) ON CONFLICT(route_id,delivery_key) DO NOTHING",[d.id,d.service,d.alertKey,d.routeId,d.deliveryKey,d.channel,d.status,d.attemptedAt,d.correlationId??null,d.evidenceHash]);
 }
 async recordDegradedDrill(d:DegradedDrill):Promise<void>{
  if(!d.service||!d.dependency||!d.correlationId||!HEX64.test(d.evidenceHash)) throw new Error("DEGRADED_DRILL_INVALID");
  await this.db.query("INSERT INTO operational_degraded_drills(id,service,dependency,mode,started_at,ended_at,correlation_id,evidence_hash) VALUES($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8)",[d.id,d.service,d.dependency,d.mode,d.startedAt,d.endedAt??null,d.correlationId,d.evidenceHash]);
 }
 async listRoutesForSeverity(severity:Severity):Promise<Array<{routeId:string;channel:Channel;destinationRef:string}>>{
  const r=await this.db.query("SELECT route_id,channel,destination_ref FROM incident_routes WHERE enabled=true AND CASE minimum_severity WHEN 'low' THEN 0 WHEN 'medium' THEN 1 WHEN 'high' THEN 2 ELSE 3 END <= CASE $1 WHEN 'low' THEN 0 WHEN 'medium' THEN 1 WHEN 'high' THEN 2 ELSE 3 END",[severity]);
  return r.rows.map(x=>({routeId:String(x.route_id),channel:x.channel as Channel,destinationRef:String(x.destination_ref)}));
 }
}
