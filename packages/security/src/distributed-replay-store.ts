import type {Client} from "pg";

export interface ReplayClaim {
  readonly scope:string;
  readonly actionId:string;
  readonly payloadHash:string;
  readonly expiresAt:number;
}

export interface ReplayStore {
  claim(key:ReplayClaim, now?:number):Promise<boolean>;
  prune(now?:number):Promise<number>;
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
    const result=await this.client.query(
      `INSERT INTO security_replay_claims(scope,action_id,payload_hash,expires_at)
       VALUES($1,$2,$3,to_timestamp($4/1000.0))
       ON CONFLICT (scope,action_id,payload_hash) DO UPDATE
       SET expires_at=security_replay_claims.expires_at
       WHERE security_replay_claims.expires_at <= to_timestamp($5/1000.0)`,
      [key.scope,key.actionId,key.payloadHash,key.expiresAt,now]
    );
    return (result.rowCount??0)>0;
  }

  async prune(now=Date.now()):Promise<number>{
    const result=await this.client.query(
      `DELETE FROM security_replay_claims
       WHERE expires_at <= to_timestamp($1/1000.0)`,
      [now]
    );
    return result.rowCount??0;
  }
}
