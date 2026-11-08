import { randomUUID } from "node:crypto";
import type { BulletinSnapshot } from "./bulletin-snapshot.js";
import type { PostgresTransactionClient } from "./postgres-sync-fabric.js";

export interface BulletinPersistenceScope {
  tenantId: string;
  organizationId: string;
  actorId: string;
}
export interface PersistedBulletin {
  bulletinId: string;
  studentId: string;
  academicYear: string;
  periodCode: string;
  revision: number;
  contentHash: string;
  snapshot: BulletinSnapshot;
  state: "PUBLISHED" | "VOID";
  createdAt: string;
}
interface BulletinRow {
  bulletin_id: string;
  student_id: string;
  academic_year: string;
  period_code: string;
  revision: number;
  content_hash: string;
  snapshot: BulletinSnapshot;
  state: "PUBLISHED" | "VOID";
  created_at: Date | string;
}
const validScope = (scope: BulletinPersistenceScope) =>
  Boolean(scope.tenantId && scope.organizationId && scope.actorId);

function mapRow(row: BulletinRow): PersistedBulletin {
  return {
    bulletinId: row.bulletin_id,
    studentId: row.student_id,
    academicYear: row.academic_year,
    periodCode: row.period_code,
    revision: Number(row.revision),
    contentHash: row.content_hash,
    snapshot: row.snapshot,
    state: row.state,
    createdAt: new Date(row.created_at).toISOString()
  };
}

/**
 * Transaction-scoped persistence. The caller MUST pass the same transaction
 * client used by PostgresSchoolMutationUnitOfWork so audit and Outbox commit
 * atomically with the snapshot. Never pass a pool-level query facade.
 */
export class PostgresBulletinSnapshotRepository {
  constructor(private readonly tx: PostgresTransactionClient) {}

  async create(
    scope: BulletinPersistenceScope,
    snapshot: BulletinSnapshot
  ): Promise<PersistedBulletin> {
    if (!validScope(scope)) throw new Error("EDUCATION_BULLETIN_SCOPE_REQUIRED");
    if (snapshot.context.organizationId !== scope.organizationId)
      throw new Error("EDUCATION_BULLETIN_ORGANIZATION_MISMATCH");
    if (!/^[a-f0-9]{64}$/.test(snapshot.contentHash))
      throw new Error("EDUCATION_BULLETIN_HASH_INVALID");

    // Serialize revision allocation for one student/period without locking unrelated students.
    await this.tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${scope.tenantId}:${scope.organizationId}:${snapshot.student.studentId}:${snapshot.context.academicYear}:${snapshot.context.periodCode}`]
    );
    const duplicate = await this.tx.query<BulletinRow>(
      `SELECT bulletin_id,student_id,academic_year,period_code,revision,
              content_hash,snapshot,state,created_at
         FROM education_bulletin_snapshots
        WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3
          AND academic_year=$4 AND period_code=$5 AND content_hash=$6
        LIMIT 1`,
      [scope.tenantId,scope.organizationId,snapshot.student.studentId,
       snapshot.context.academicYear,snapshot.context.periodCode,snapshot.contentHash]
    );
    if (duplicate.rows[0]) return mapRow(duplicate.rows[0]);

    const next = await this.tx.query<{ revision: number }>(
      `SELECT COALESCE(MAX(revision),0)+1 AS revision
         FROM education_bulletin_snapshots
        WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3
          AND academic_year=$4 AND period_code=$5`,
      [scope.tenantId,scope.organizationId,snapshot.student.studentId,
       snapshot.context.academicYear,snapshot.context.periodCode]
    );
    const revision = Number(next.rows[0]?.revision);
    if (!Number.isSafeInteger(revision) || revision < 1)
      throw new Error("EDUCATION_BULLETIN_REVISION_ALLOCATION_FAILED");

    const inserted = await this.tx.query<BulletinRow>(
      `INSERT INTO education_bulletin_snapshots
        (bulletin_id,tenant_id,organization_id,student_id,class_id,academic_year,
         period_code,revision,content_hash,snapshot_schema_version,snapshot,state,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'PUBLISHED',$12)
       RETURNING bulletin_id,student_id,academic_year,period_code,revision,
                 content_hash,snapshot,state,created_at`,
      [randomUUID(),scope.tenantId,scope.organizationId,snapshot.student.studentId,
       snapshot.context.classId,snapshot.context.academicYear,snapshot.context.periodCode,
       revision,snapshot.contentHash,snapshot.schemaVersion,JSON.stringify(snapshot),scope.actorId]
    );
    if ((inserted.rowCount ?? 0) !== 1 || !inserted.rows[0])
      throw new Error("EDUCATION_BULLETIN_PERSISTENCE_FAILED");
    return mapRow(inserted.rows[0]);
  }

  async getById(scope: BulletinPersistenceScope, bulletinId: string): Promise<PersistedBulletin | null> {
    if (!validScope(scope)) throw new Error("EDUCATION_BULLETIN_SCOPE_REQUIRED");
    if (!/^[0-9a-f-]{36}$/i.test(bulletinId)) throw new Error("EDUCATION_BULLETIN_ID_INVALID");
    const result = await this.tx.query<BulletinRow>(
      `SELECT bulletin_id,student_id,academic_year,period_code,revision,
              content_hash,snapshot,state,created_at
         FROM education_bulletin_snapshots
        WHERE tenant_id=$1 AND organization_id=$2 AND bulletin_id=$3`,
      [scope.tenantId,scope.organizationId,bulletinId]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async listForStudent(
    scope: BulletinPersistenceScope,
    input: { studentId: string; academicYear: string; periodCode: string; limit?: number }
  ): Promise<PersistedBulletin[]> {
    if (!validScope(scope)) throw new Error("EDUCATION_BULLETIN_SCOPE_REQUIRED");
    if (!input.studentId || !/^\d{4}-\d{4}$/.test(input.academicYear) ||
        !/^[A-Z0-9][A-Z0-9._-]{0,31}$/.test(input.periodCode))
      throw new Error("EDUCATION_BULLETIN_QUERY_INVALID");
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new Error("EDUCATION_BULLETIN_LIMIT_INVALID");
    const result = await this.tx.query<BulletinRow>(
      `SELECT bulletin_id,student_id,academic_year,period_code,revision,
              content_hash,snapshot,state,created_at
         FROM education_bulletin_snapshots
        WHERE tenant_id=$1 AND organization_id=$2 AND student_id=$3
          AND academic_year=$4 AND period_code=$5
        ORDER BY revision DESC LIMIT $6`,
      [scope.tenantId,scope.organizationId,input.studentId,input.academicYear,input.periodCode,limit]
    );
    return result.rows.map(mapRow);
  }
}
