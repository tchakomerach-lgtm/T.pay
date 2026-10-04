import type {PoolClient} from "pg";
import type {OrganizationAccessAttemptRepository,AccessAttemptState} from "./access-service.js";

export class PostgresOrganizationAccessAttemptRepository implements OrganizationAccessAttemptRepository {
  constructor(private readonly db:Pick<PoolClient,"query">){}

  async getState(organizationId:string,userId:string):Promise<AccessAttemptState|undefined>{
    const r=await this.db.query(
      "SELECT failed_count,locked_until FROM organization_access_attempts WHERE organization_id=$1 AND user_id=$2",
      [organizationId,userId]
    );
    const row=r.rows[0]; if(!row) return undefined;
    return {failedCount:Number(row.failed_count),lockedUntil:row.locked_until?new Date(row.locked_until).toISOString():undefined};
  }

  async recordFailure(organizationId:string,userId:string,now:string,windowSeconds:number,maxFailures:number,lockSeconds:number):Promise<AccessAttemptState>{
    if(windowSeconds<1||maxFailures<1||lockSeconds<1) throw new Error("ORG_ACCESS_POLICY_INVALID");
    const r=await this.db.query(
      `INSERT INTO organization_access_attempts (organization_id,user_id,window_started_at,failed_count,locked_until)
       VALUES ($1,$2,$3::timestamptz,1,NULL)
       ON CONFLICT (organization_id,user_id) DO UPDATE
       SET failed_count=CASE
         WHEN EXTRACT(EPOCH FROM ($3::timestamptz-organization_access_attempts.window_started_at)) >= $4
         THEN 1 ELSE organization_access_attempts.failed_count+1 END,
           window_started_at=CASE
         WHEN EXTRACT(EPOCH FROM ($3::timestamptz-organization_access_attempts.window_started_at)) >= $4
         THEN $3::timestamptz ELSE organization_access_attempts.window_started_at END,
           locked_until=CASE
         WHEN (CASE WHEN EXTRACT(EPOCH FROM ($3::timestamptz-organization_access_attempts.window_started_at)) >= $4 THEN 1 ELSE organization_access_attempts.failed_count+1 END) >= $5
         THEN $3::timestamptz + ($6 * interval '1 second')
         ELSE organization_access_attempts.locked_until END
       RETURNING failed_count,locked_until`,
      [organizationId,userId,now,windowSeconds,maxFailures,lockSeconds]
    );
    const row=r.rows[0];
    return {failedCount:Number(row.failed_count),lockedUntil:row.locked_until?new Date(row.locked_until).toISOString():undefined};
  }

  async clear(organizationId:string,userId:string):Promise<void>{
    await this.db.query("DELETE FROM organization_access_attempts WHERE organization_id=$1 AND user_id=$2",[organizationId,userId]);
  }
}
