import type { Client } from "pg";
import type { AtomicOfflineClaimStore, DeviceBinding, OfflineReplayStore, DeviceBindingStore } from "../../security/src/field-offline.js";

export class PostgresFieldOfflineClaimStore implements AtomicOfflineClaimStore {
  constructor(private readonly client: Client) {}

  async get(organizationId: string, deviceId: string, keyId: string): Promise<DeviceBinding | undefined> {
    const result = await this.client.query<{
      device_id: string;
      organization_id: string;
      key_id: string;
      public_key_pem: string;
      max_offline_seconds: number;
      last_accepted_sequence: string;
    }>(
      `SELECT d.device_id, d.organization_id, k.key_id, k.public_key_pem,
              d.max_offline_seconds, d.last_accepted_sequence::text
         FROM field_devices d
         JOIN field_device_keys k
           ON k.organization_id = d.organization_id
          AND k.device_id = d.device_id
        WHERE d.organization_id = $1
          AND d.device_id = $2
          AND k.key_id = $3
          AND d.status = 'active'
          AND k.status = 'active'`,
      [organizationId, deviceId, keyId]
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      organizationId: row.organization_id,
      deviceId: row.device_id,
      keyId: row.key_id,
      publicKeyPem: row.public_key_pem,
      status: "active",
      maxOfflineSeconds: Number(row.max_offline_seconds),
      lastAcceptedSequence: Number(row.last_accepted_sequence)
    };
  }

  async claim(envelopeId: string, organizationId: string, deviceId: string, sequence: number): Promise<boolean> {
    const result = await this.client.query(
      `INSERT INTO field_offline_replay_claims
         (envelope_id, organization_id, device_id, sequence, claimed_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT DO NOTHING
       RETURNING envelope_id`,
      [envelopeId, organizationId, deviceId, sequence]
    );
    return result.rowCount === 1;
  }

  async advanceSequence(organizationId: string, deviceId: string, sequence: number): Promise<boolean> {
    const result = await this.client.query(
      `UPDATE field_devices
          SET last_accepted_sequence = $3
        WHERE organization_id = $1
          AND device_id = $2
          AND status = 'active'
          AND last_accepted_sequence = $3 - 1`,
      [organizationId, deviceId, sequence]
    );
    return result.rowCount === 1;
  }

  async claimAndAdvance(
    envelopeId: string,
    organizationId: string,
    deviceId: string,
    sequence: number
  ): Promise<boolean> {
    await this.client.query("BEGIN");
    try {
      const claim = await this.client.query(
        `INSERT INTO field_offline_replay_claims
           (envelope_id, organization_id, device_id, sequence, claimed_at)
         SELECT $1,$2,$3,$4,now()
          WHERE EXISTS (
            SELECT 1
              FROM field_devices
             WHERE organization_id = $2
               AND device_id = $3
               AND status = 'active'
               AND last_accepted_sequence = $4 - 1
          )
         ON CONFLICT DO NOTHING
         RETURNING envelope_id`,
        [envelopeId, organizationId, deviceId, sequence]
      );
      if (claim.rowCount !== 1) {
        await this.client.query("ROLLBACK");
        return false;
      }

      const advanced = await this.client.query(
        `UPDATE field_devices
            SET last_accepted_sequence = $3
          WHERE organization_id = $1
            AND device_id = $2
            AND status = 'active'
            AND last_accepted_sequence = $3 - 1`,
        [organizationId, deviceId, sequence]
      );
      if (advanced.rowCount !== 1) {
        await this.client.query("ROLLBACK");
        return false;
      }

      await this.client.query("COMMIT");
      return true;
    } catch (error) {
      await this.client.query("ROLLBACK");
      throw error;
    }
  }
}

export type { OfflineReplayStore, DeviceBindingStore };
