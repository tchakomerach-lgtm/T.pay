import type { QueryResult, QueryResultRow } from "pg";
import type { ActionReceipt, AgentAuthority, Claim, Commitment, Evidence } from "./assurance.js";

export interface OpportunityQueryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

export interface OpportunityTransaction extends OpportunityQueryable {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class PostgresOpportunityAssuranceRepository {
  public constructor(private readonly db: OpportunityQueryable) {}

  public async getClaim(tenantId: string, organizationId: string, claimId: string): Promise<Claim | undefined> {
    const result = await this.db.query<any>(
      "SELECT id, tenant_id, organization_id, subject_id, issuer_id, claim_type, value, issued_at, expires_at, status, confidence, evidence_ids, provenance FROM opportunity_claims WHERE tenant_id=$1 AND organization_id=$2 AND id=$3",
      [tenantId, organizationId, claimId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id, tenantId: row.tenant_id, organizationId: row.organization_id,
      subjectId: row.subject_id, issuerId: row.issuer_id, type: row.claim_type,
      value: row.value, issuedAt: row.issued_at.toISOString(),
      ...(row.expires_at ? { expiresAt: row.expires_at.toISOString() } : {}),
      status: row.status, confidence: Number(row.confidence),
      evidenceIds: Array.isArray(row.evidence_ids) ? row.evidence_ids.map(String) : [],
      provenance: row.provenance,
    };
  }

  public async saveClaim(claim: Claim): Promise<void> {
    await this.db.query(
      "INSERT INTO opportunity_claims (id,tenant_id,organization_id,subject_id,issuer_id,claim_type,value,issued_at,expires_at,status,confidence,evidence_ids,provenance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)",
      [claim.id, claim.tenantId, claim.organizationId, claim.subjectId, claim.issuerId, claim.type, claim.value, claim.issuedAt, claim.expiresAt ?? null, claim.status, claim.confidence, JSON.stringify(claim.evidenceIds), claim.provenance],
    );
  }

  public async saveEvidence(evidence: Evidence): Promise<void> {
    await this.db.query(
      "INSERT INTO opportunity_evidence (id,tenant_id,organization_id,subject_id,kind,sha256,captured_at,expires_at,issuer_id,origin,integrity,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)",
      [evidence.id, evidence.tenantId, evidence.organizationId, evidence.subjectId, evidence.kind, evidence.sha256, evidence.capturedAt, evidence.expiresAt ?? null, evidence.issuerId ?? null, evidence.origin, evidence.integrity, JSON.stringify(evidence.metadata)],
    );
  }

  public async saveCommitment(commitment: Commitment): Promise<void> {
    await this.db.query(
      "INSERT INTO opportunity_commitments (id,tenant_id,organization_id,actor_id,opportunity_id,action,expected_result,deadline,status,evidence_required,dependency_ids) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
      [commitment.id, commitment.tenantId, commitment.organizationId, commitment.actorId, commitment.opportunityId, commitment.action, commitment.expectedResult, commitment.deadline, commitment.status, commitment.evidenceRequired, JSON.stringify(commitment.dependencyIds)],
    );
  }

  public async appendActionReceipt(receipt: ActionReceipt): Promise<void> {
    await this.db.query(
      "INSERT INTO opportunity_action_receipts (id,tenant_id,organization_id,actor_id,agent_id,intent,action,policy_decision,expected_effect,actual_effect,data_class,action_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [receipt.id, receipt.tenantId, receipt.organizationId, receipt.actorId, receipt.agentId ?? null, receipt.intent, receipt.action, receipt.policyDecision, receipt.expectedEffect, receipt.actualEffect ?? null, receipt.dataClass, receipt.actionHash],
    );
  }

  public async saveAgentAuthority(authority: AgentAuthority): Promise<void> {
    await this.db.query(
      "INSERT INTO opportunity_agent_authorities (agent_id,principal_id,tenant_id,organization_id,purpose,resource,actions,expires_at,max_actions,max_value_minor) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)",
      [authority.agentId, authority.principalId, authority.tenantId, authority.organizationId, authority.purpose, authority.resource, JSON.stringify(authority.actions), authority.expiresAt, authority.maxActions, authority.maxValueMinor === undefined ? null : authority.maxValueMinor.toString()],
    );
  }

  public async runAtomic<T>(operation: (repository: PostgresOpportunityAssuranceRepository) => Promise<T>): Promise<T> {
    const connection = this.db as OpportunityTransaction;
    if (typeof connection.begin !== "function") throw new Error("OPPORTUNITY_TRANSACTION_REQUIRED");
    await connection.begin();
    try {
      const result = await operation(new PostgresOpportunityAssuranceRepository(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
}
