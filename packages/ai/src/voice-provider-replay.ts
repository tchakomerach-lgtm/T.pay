export interface VoiceProviderReplayDb {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: readonly Row[]; rowCount: number }>;
}

/** Durable claim is tenant-scoped and binds an event id to the exact payload hash. */
export class PostgresVoiceProviderReplayStore {
  constructor(private readonly db: VoiceProviderReplayDb) {}

  async claim(
    organizationId: string,
    providerId: string,
    eventId: string,
    payloadSha256: string,
    receivedAt: string,
  ): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(payloadSha256)) throw new Error("VOICE_PROVIDER_PAYLOAD_HASH_INVALID");
    const inserted = await this.db.query(
      "INSERT INTO voice_provider_callback_claims (organization_id, provider_id, event_id, payload_sha256, first_received_at) VALUES ($1,$2,$3,$4,$5::timestamptz) ON CONFLICT (organization_id, provider_id, event_id) DO NOTHING",
      [organizationId, providerId, eventId, payloadSha256, receivedAt],
    );
    if (inserted.rowCount === 1) return true;
    const existing = await this.db.query<{ payload_sha256: string }>(
      "SELECT payload_sha256 FROM voice_provider_callback_claims WHERE organization_id=$1 AND provider_id=$2 AND event_id=$3",
      [organizationId, providerId, eventId],
    );
    const hash = existing.rows[0]?.payload_sha256;
    if (!hash) throw new Error("VOICE_PROVIDER_REPLAY_CLAIM_STATE_MISSING");
    if (hash !== payloadSha256) throw new Error("VOICE_PROVIDER_REPLAY_PAYLOAD_CONFLICT");
    return false;
  }
}
