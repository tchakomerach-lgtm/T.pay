import type { UUID } from "../../domain/src/types.js";
import type { CommunityTontineMfAccess, CommunityTontineMfReconciliationItem } from "./community-tontine-management.js";
import type { TontineSqlExecutor } from "./tontine-repositories.js";

export interface CommunityTontineMfAccessRepository {
  getActive(organizationId: UUID, tontineGroupId: UUID, microfinanceId: UUID, role: CommunityTontineMfAccess["role"]): Promise<CommunityTontineMfAccess | null>;
  save(access: CommunityTontineMfAccess): Promise<void>;
  revoke(organizationId: UUID, accessId: UUID): Promise<void>;
}
export interface CommunityTontineMfReconciliationRepository {
  listOpen(organizationId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfReconciliationItem[]>;
  save(organizationId: UUID, item: CommunityTontineMfReconciliationItem): Promise<void>;
}
function accessFromRow(row: Record<string, unknown>): CommunityTontineMfAccess {
  const access: CommunityTontineMfAccess = {
    id: row.id as UUID, organizationId: row.organization_id as UUID, tontineGroupId: row.tontine_group_id as UUID,
    microfinanceId: row.microfinance_id as UUID, role: row.role as CommunityTontineMfAccess["role"],
    status: row.status as CommunityTontineMfAccess["status"], grantedBy: row.granted_by as UUID,
    createdAt: new Date(String(row.created_at)).toISOString()
  };
  if (row.expires_at != null) access.expiresAt = new Date(String(row.expires_at)).toISOString();
  return access;
}
function reconciliationFromRow(row: Record<string, unknown>): CommunityTontineMfReconciliationItem {
  return {
    id: row.id as UUID, tontineGroupId: row.tontine_group_id as UUID, microfinanceId: row.microfinance_id as UUID,
    externalReference: String(row.external_reference), expectedMinor: BigInt(String(row.expected_minor)),
    observedMinor: BigInt(String(row.observed_minor)), currency: String(row.currency),
    state: row.state as CommunityTontineMfReconciliationItem["state"],
    openedAt: new Date(String(row.opened_at)).toISOString()
  };
}
export class PostgresCommunityTontineMfAccessRepository implements CommunityTontineMfAccessRepository {
  constructor(private readonly db: TontineSqlExecutor) {}
  async getActive(organizationId: UUID, tontineGroupId: UUID, microfinanceId: UUID, role: CommunityTontineMfAccess["role"]): Promise<CommunityTontineMfAccess | null> {
    const result = await this.db.query(
      `SELECT * FROM community_tontine_mf_access WHERE organization_id=$1 AND tontine_group_id=$2 AND microfinance_id=$3
       AND role=$4 AND status='active' AND (expires_at IS NULL OR expires_at > now())
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId, tontineGroupId, microfinanceId, role]
    );
    return result.rows[0] ? accessFromRow(result.rows[0]) : null;
  }
  async save(access: CommunityTontineMfAccess): Promise<void> {
    await this.db.query(
      `INSERT INTO community_tontine_mf_access
       (id,organization_id,tontine_group_id,microfinance_id,role,status,granted_by,created_at,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,expires_at=EXCLUDED.expires_at`,
      [access.id, access.organizationId, access.tontineGroupId, access.microfinanceId, access.role, access.status, access.grantedBy, access.createdAt, access.expiresAt ?? null]
    );
  }
  async revoke(organizationId: UUID, accessId: UUID): Promise<void> {
    const result = await this.db.query(
      `UPDATE community_tontine_mf_access SET status='revoked'
       WHERE organization_id=$1 AND id=$2 AND status <> 'revoked'`,
      [organizationId, accessId]
    );
    if ((result.rowCount ?? 0) !== 1) throw new Error("COMMUNITY_TONTINE_MF_ACCESS_NOT_FOUND");
  }
}
export class PostgresCommunityTontineMfReconciliationRepository implements CommunityTontineMfReconciliationRepository {
  constructor(private readonly db: TontineSqlExecutor) {}
  async listOpen(organizationId: UUID, microfinanceId: UUID): Promise<CommunityTontineMfReconciliationItem[]> {
    const result = await this.db.query(
      `SELECT * FROM community_tontine_mf_reconciliation
       WHERE organization_id=$1 AND microfinance_id=$2 AND state IN ('open','investigating','escalated')
       ORDER BY opened_at ASC,id ASC`,
      [organizationId, microfinanceId]
    );
    return result.rows.map(reconciliationFromRow);
  }
  async save(organizationId: UUID, item: CommunityTontineMfReconciliationItem): Promise<void> {
    await this.db.query(
      `INSERT INTO community_tontine_mf_reconciliation
       (id,organization_id,tontine_group_id,microfinance_id,external_reference,expected_minor,observed_minor,currency,state,opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET expected_minor=EXCLUDED.expected_minor,observed_minor=EXCLUDED.observed_minor,
       state=EXCLUDED.state,resolved_at=CASE WHEN EXCLUDED.state='resolved' THEN now() ELSE NULL END`,
      [item.id, organizationId, item.tontineGroupId, item.microfinanceId, item.externalReference,
       item.expectedMinor.toString(), item.observedMinor.toString(), item.currency, item.state, item.openedAt]
    );
  }
}
