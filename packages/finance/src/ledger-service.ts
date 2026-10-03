import { assertBalanced, type LedgerLine } from "./ledger.js";
import { requireIdempotency, type IdempotencyStore } from "../../security/src/idempotency.js";

export interface LedgerTransaction {
  id: string;
  organizationId: string;
  idempotencyKey: string;
  occurredAt: string;
  lines: readonly LedgerLine[];
  postedAt: string;
}

export interface LedgerRepository {
  findByIdempotencyKey(organizationId: string, key: string): Promise<LedgerTransaction | undefined>;
  append(transaction: LedgerTransaction): Promise<void>;
}

export async function postLedgerTransaction(
  repository: LedgerRepository,
  idempotency: IdempotencyStore,
  transaction: LedgerTransaction
): Promise<LedgerTransaction> {
  if (!transaction.organizationId) throw new Error("LEDGER_ORGANIZATION_REQUIRED");
  assertBalanced(transaction.lines);
  await requireIdempotency(idempotency, transaction.idempotencyKey);
  const existing = await repository.findByIdempotencyKey(transaction.organizationId, transaction.idempotencyKey);
  if (existing) return existing;
  await repository.append(transaction);
  return transaction;
}
