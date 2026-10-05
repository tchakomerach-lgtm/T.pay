import type {Client} from "pg";

export interface ReplayClaim {
  readonly scope:string;
  readonly actionId:string;
  readonly payloadHash:string;
  readonly expiresAt:number;
}

export interface ReplayStore {
  claim(key:ReplayClaim, now?:number):Promise<boolean>;
  prune(organizationId:string, now?:number):Promise<number>;
}

/**
 * Production replay protection must be shared by all application instances.
 * A local ReplayGuard remains useful as a fast-path, but it is never sufficient
 * for a horizontally scaled financial or identity-sensitive workflow.
 */
export class PostgresReplayStore implements ReplayStore {
  constructor(private readonly client:Client){}

  async claim(key:ReplayClaim, now=Date.now()):Promise<boolean>{
    if(!key.scope.trim()||!key.actionId.trim()||!key.payloadHash.trim()||key.expiresAt<=now){
      throw new Error("REPLAY_CONTEXT_INVALID");
    }
    const organizationId=organizationFromScope(key.scope);
    await this.client.query("BEGIN");
    try{
      await this.client.query("SELECT set_config('tpay.organization_id',$1,true)",[organizationId]);
      const result=await this.client.query(
       `INSERT INTO security_replay_claims(scope,action_id,payload_hash,expires_at)
        VALUES($1,$2,$3,to_timestamp($4/1000.0))
        ON CONFLICT (scope,action_id,payload_hash) DO UPDATE
        SET expires_at=security_replay_claims.expires_at
        WHERE security_replay_claims.expires_at <= to_timestamp($5/1000.0)`,
       [key.scope,key.actionId,key.payloadHash,key.expiresAt,now]
      );
      await this.client.query("COMMIT");
      return (result.rowCount??0)>0;
    }catch(error){
      await this.client.query("ROLLBACK");
      throw error;
    }
  }

  async prune(organizationId:string,now=Date.now()):Promise<number>{
    if(!organizationId.trim())throw new Error("TENANT_SECURITY_CONTEXT_REQUIRED");
    await this.client.query("BEGIN");
    try{
      await this.client.query("SELECT set_config('tpay.organization_id',$1,true)",[organizationId]);
      const result=await this.client.query(
       `DELETE FROM security_replay_claims
        WHERE expires_at <= to_timestamp($1/1000.0)`,
       [now]
      );
      await this.client.query("COMMIT");
      return result.rowCount??0;
    }catch(error){
      await this.client.query("ROLLBACK");
      throw error;
    }
  }
}
function organizationFromScope(scope:string):string{
 const [kind,organizationId,...rest]=scope.split(":");
 if(kind!=="org"||!organizationId||rest.length>0)throw new Error("REPLAY_SCOPE_TENANT_REQUIRED");
 return organizationId;
}
