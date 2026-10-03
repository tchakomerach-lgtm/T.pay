import type { FinancialAccount } from "./account.js";
import type { LedgerTransaction } from "./ledger-service.js";

export interface AccountRepository {
  getById(organizationId: string, accountId: string): Promise<FinancialAccount | undefined>;
  save(account: FinancialAccount, expectedVersion: number): Promise<void>;
}

export interface LedgerStore {
  findByIdempotencyKey(organizationId: string, key: string): Promise<LedgerTransaction | undefined>;
  append(transaction: LedgerTransaction): Promise<void>;
}

/** Production implementations MUST map run() to one database transaction. */
export interface FinancialUnitOfWork {
  accounts: AccountRepository;
  ledger: LedgerStore;
  run<T>(operation: (tx: FinancialUnitOfWork) => Promise<T>): Promise<T>;
}

export interface FinancialPersistenceInvariants {
  readonly uniqueIdempotencyScope: "organization";
  readonly ledgerAppendOnly: true;
  readonly atomicFinancialCommit: true;
  readonly optimisticAccountConcurrency: true;
}
