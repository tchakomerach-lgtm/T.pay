export interface CommunityTontineContributionFinanceSummary {
  totalCount: number;
  confirmedCount: number;
  pendingCount: number;
  exceptionCount: number;
  confirmedMinor: bigint;
  pendingMinor: bigint;
  invalidAmountCount: number;
}

function amountMinor(value: unknown): bigint | null {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (!/^[0-9]{1,38}$/.test(raw)) return null;
  try { return BigInt(raw); } catch { return null; }
}

/**
 * Summarizes only persisted contribution rows returned by the authenticated API.
 * It deliberately does not infer a payment from an intent or provider reference.
 */
export function summarizeCommunityTontineContributions(
  rows: readonly Record<string, unknown>[]
): CommunityTontineContributionFinanceSummary {
  let confirmedCount = 0;
  let pendingCount = 0;
  let exceptionCount = 0;
  let confirmedMinor = 0n;
  let pendingMinor = 0n;
  let invalidAmountCount = 0;

  for (const row of rows) {
    const amount = amountMinor(row.amount_minor);
    if (amount === null) invalidAmountCount++;
    if (row.status === "confirmed") {
      confirmedCount++;
      if (amount !== null) confirmedMinor += amount;
    } else if (row.status === "pending") {
      pendingCount++;
      if (amount !== null) pendingMinor += amount;
    } else {
      // Failed, reversed, disputed, unknown and future states remain exceptions.
      exceptionCount++;
    }
  }

  return {
    totalCount: rows.length,
    confirmedCount,
    pendingCount,
    exceptionCount,
    confirmedMinor,
    pendingMinor,
    invalidAmountCount
  };
}
