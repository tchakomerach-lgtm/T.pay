import type {PoolClient} from "pg";
export interface SecurityIncident {id:string;organizationId?:string;actorUserId?:string;category:string;severity:"low"|"medium"|"high"|"critical";evidenceHash:string;correlationId:string;createdAt:string;}
export class PostgresSecurityIncidentRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}
  async append(i:SecurityIncident):Promise<void>{
    await this.db.query("INSERT INTO security_incidents (id,organization_id,actor_user_id,category,severity,evidence_hash,correlation_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)",[i.id,i.organizationId??null,i.actorUserId??null,i.category,i.severity,i.evidenceHash,i.correlationId,i.createdAt]);
  }
}
