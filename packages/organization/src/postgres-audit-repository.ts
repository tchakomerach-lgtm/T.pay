import type {PoolClient} from "pg";

export interface OrganizationAuditEvent {
  id:string;
  organizationId:string;
  actorUserId:string;
  action:string;
  targetType:string;
  targetId?:string;
  metadata:Record<string,unknown>;
  createdAt:string;
}

export class PostgresOrganizationAuditRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}

  async append(event:OrganizationAuditEvent):Promise<void>{
    await this.db.query(
      "INSERT INTO organization_audit_events (id,organization_id,actor_user_id,action,target_type,target_id,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::timestamptz)",
      [event.id,event.organizationId,event.actorUserId,event.action,event.targetType,event.targetId??null,JSON.stringify(event.metadata),event.createdAt]
    );
  }
}
