export interface ProviderReplayDb {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(text:string, values?:readonly unknown[]):Promise<{rows:readonly Row[];rowCount:number}>;
}

/** Durable ingress replay barrier, separate from the final settlement idempotency barrier. */
export class PostgresProviderReplayStore {
  constructor(private readonly db:ProviderReplayDb) {}
  async claim(organizationId:string,providerId:string,eventId:string,payloadHash:string,receivedAt:string):Promise<boolean>{
    const result=await this.db.query(
      "INSERT INTO provider_callback_claims (organization_id, provider, event_id, payload_sha256, first_received_at) VALUES ($1,$2,$3,$4,$5::timestamptz) ON CONFLICT (organization_id, provider, event_id) DO NOTHING",
      [organizationId,providerId,eventId,payloadHash,receivedAt]
    );
    if(result.rowCount===1) return true;
    const existing=await this.db.query<{payload_sha256:string}>("SELECT payload_sha256 FROM provider_callback_claims WHERE organization_id=$1 AND provider=$2 AND event_id=$3",[organizationId,providerId,eventId]);
    const hash=existing.rows[0]?.payload_sha256;
    if(!hash) throw new Error("PROVIDER_REPLAY_CLAIM_STATE_MISSING");
    if(hash!==payloadHash) throw new Error("PROVIDER_REPLAY_PAYLOAD_CONFLICT");
    return false;
  }
}