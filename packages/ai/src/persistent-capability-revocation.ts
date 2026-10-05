import type {Client} from "pg";

export interface CapabilityRevocationState {
  readonly capabilityId:string;
  readonly revokedAt:number;
  readonly reason:string;
}

export interface CapabilityRevocationStore {
  revoke(state:CapabilityRevocationState):Promise<void>;
  isRevoked(capabilityId:string):Promise<boolean>;
  revokeAll(reason:string):Promise<number>;
  isGloballyRevoked(sinceEpoch?:number):Promise<boolean>;
}

/**
 * Revocation is an authorization boundary. It must be observable across
 * instances and must never silently fall back to process-local memory.
 */
export class PostgresCapabilityRevocationStore implements CapabilityRevocationStore {
  constructor(private readonly client:Client){}

  async revoke(state:CapabilityRevocationState):Promise<void>{
    if(!state.capabilityId.trim()||!state.reason.trim()) throw new Error("AI_CAPABILITY_REVOCATION_CONTEXT_REQUIRED");
    await this.client.query(
      `INSERT INTO ai_capability_revocations(capability_id,revoked_at,reason)
       VALUES($1,to_timestamp($2/1000.0),$3)
       ON CONFLICT(capability_id) DO UPDATE
       SET revoked_at=EXCLUDED.revoked_at, reason=EXCLUDED.reason`,
      [state.capabilityId,state.revokedAt,state.reason]
    );
  }

  async isRevoked(capabilityId:string):Promise<boolean>{
    if(!capabilityId.trim()) throw new Error("AI_CAPABILITY_ID_REQUIRED");
    const result=await this.client.query(
      `SELECT 1 FROM ai_capability_revocations
       WHERE capability_id=$1 LIMIT 1`,
      [capabilityId]
    );
    return result.rowCount===1;
  }

  async revokeAll(reason:string):Promise<number>{
    if(!reason.trim()) throw new Error("AI_CAPABILITY_REVOCATION_REASON_REQUIRED");
    const result=await this.client.query(
      `UPDATE ai_capability_revocation_state
       SET global_revocation_epoch=global_revocation_epoch+1, updated_at=now()
       WHERE state_id=1
       RETURNING global_revocation_epoch`,
      []
    );
    if(result.rowCount!==1) throw new Error("AI_CAPABILITY_REVOCATION_STATE_UNAVAILABLE");
    return Number(result.rows[0].global_revocation_epoch);
  }

  async isGloballyRevoked(sinceEpoch=0):Promise<boolean>{
    if(!Number.isSafeInteger(sinceEpoch)||sinceEpoch<0) throw new Error("AI_CAPABILITY_REVOCATION_EPOCH_INVALID");
    const result=await this.client.query<{global_revocation_epoch:number|string}>(
      `SELECT global_revocation_epoch
       FROM ai_capability_revocation_state
       WHERE state_id=1`,
      []
    );
    if(result.rowCount!==1) throw new Error("AI_CAPABILITY_REVOCATION_STATE_UNAVAILABLE");
    return Number(result.rows[0].global_revocation_epoch)>sinceEpoch;
  }
}
