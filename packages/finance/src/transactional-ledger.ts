import { assertAccountCanPost } from "./account.js";
import { assertBalanced } from "./ledger.js";
import type { FinancialUnitOfWork } from "./persistence.js";
import type { LedgerTransaction } from "./ledger-service.js";

export interface PostFinancialTransactionResult {
  transaction: LedgerTransaction;
  replayed: boolean;
}

/**
 * Transactional posting boundary.
 *
 * The database transaction, not this function, is the ultimate concurrency
 * control. A unique constraint on (organizationId, idempotencyKey) MUST exist.
 */
export async function postFinancialTransaction(
  uow: FinancialUnitOfWork,
  transaction: LedgerTransaction
): Promise<PostFinancialTransactionResult> {
  if (!transaction.organizationId) {
    throw new Error("LEDGER_ORGANIZATION_REQUIRED");
  }

  assertBalanced(transaction.lines);

  return uow.run(async (tx) => {
    const existing = await tx.ledger.findByIdempotencyKey(
      transaction.organizationId,
      transaction.idempotencyKey
    );

    if (existing) {
      return { transaction: existing, replayed: true };
    }

    for (const line of transaction.lines) {
      const account = await tx.accounts.getById(
        transaction.organizationId,
        line.accountId
      );

      if (!account) throw new Error("LEDGER_ACCOUNT_NOT_FOUND");
      assertAccountCanPost(account);

      if (account.currency !== line.amount.currency) {
        throw new Error("LEDGER_ACCOUNT_CURRENCY_MISMATCH");
      }
    }

    await tx.ledger.append(transaction);

    return { transaction, replayed: false };
  });
}
