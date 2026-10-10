/**
 * GAIN-009 payout preflight policy. This does not execute or reserve money.
 * The caller must re-check balances/limits atomically in PostgreSQL before execution.
 */
export type PayoutGuardrailAction = "allow_for_authorized_execution" | "hold_for_review" | "reject";
export type PayoutGuardrailReason =
  | "INVALID_AMOUNT" | "INVALID_CURRENCY" | "INSUFFICIENT_TREASURY_LIQUIDITY"
  | "DAILY_LIMIT_EXCEEDED" | "RISK_HOLD_ACTIVE" | "DESTINATION_NOT_VERIFIED"
  | "DESTINATION_COOLDOWN_ACTIVE" | "PROVIDER_UNAVAILABLE" | "HUMAN_APPROVAL_REQUIRED";

export interface PayoutGuardrailInput {
  amountMinor: bigint;
  currency: string;
  /** Excludes protected customer funds, payables, reserves and the minimum buffer. */
  spendableTreasuryMinor: bigint;
  minimumLiquidityBufferMinor: bigint;
  dailyPaidMinor: bigint;
  dailyLimitMinor: bigint;
  destinationVerified: boolean;
  destinationChangedAt?: string;
  now: string;
  destinationCooldownSeconds: number;
  providerAvailable: boolean;
  riskHoldActive: boolean;
  humanApprovalRequired: boolean;
  humanApprovalPresent: boolean;
}
export interface PayoutGuardrailDecision {
  action: PayoutGuardrailAction;
  reasons: PayoutGuardrailReason[];
  amountMinor: bigint;
  currency: string;
  evaluatedAt: string;
}
function parseTimestamp(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}
/** Stable reason ordering makes decisions reproducible and auditable. */
export function evaluatePayoutGuardrails(input: PayoutGuardrailInput): PayoutGuardrailDecision {
  const reasons: PayoutGuardrailReason[] = [];
  const nowMs = parseTimestamp(input.now, "PAYOUT_GUARDRAIL_INVALID_NOW");
  if (input.amountMinor <= 0n) reasons.push("INVALID_AMOUNT");
  if (!/^[A-Z]{3}$/.test(input.currency)) reasons.push("INVALID_CURRENCY");
  if (input.spendableTreasuryMinor < 0n || input.minimumLiquidityBufferMinor < 0n ||
      input.dailyPaidMinor < 0n || input.dailyLimitMinor < 0n) {
    throw new Error("PAYOUT_GUARDRAIL_NEGATIVE_BALANCE");
  }
  const afterPayout = input.spendableTreasuryMinor - input.amountMinor;
  if (input.amountMinor > input.spendableTreasuryMinor || afterPayout < input.minimumLiquidityBufferMinor) {
    reasons.push("INSUFFICIENT_TREASURY_LIQUIDITY");
  }
  if (input.dailyPaidMinor + input.amountMinor > input.dailyLimitMinor) reasons.push("DAILY_LIMIT_EXCEEDED");
  if (input.riskHoldActive) reasons.push("RISK_HOLD_ACTIVE");
  if (!input.destinationVerified) reasons.push("DESTINATION_NOT_VERIFIED");
  if (input.destinationChangedAt !== undefined) {
    const changedAtMs = parseTimestamp(input.destinationChangedAt, "PAYOUT_GUARDRAIL_INVALID_DESTINATION_TIMESTAMP");
    if (changedAtMs > nowMs) throw new Error("PAYOUT_GUARDRAIL_FUTURE_DESTINATION_TIMESTAMP");
    if (!Number.isFinite(input.destinationCooldownSeconds) || input.destinationCooldownSeconds < 0) {
      throw new Error("PAYOUT_GUARDRAIL_INVALID_COOLDOWN");
    }
    if (nowMs - changedAtMs < input.destinationCooldownSeconds * 1000) reasons.push("DESTINATION_COOLDOWN_ACTIVE");
  }
  if (!input.providerAvailable) reasons.push("PROVIDER_UNAVAILABLE");
  if (input.humanApprovalRequired && !input.humanApprovalPresent) reasons.push("HUMAN_APPROVAL_REQUIRED");
  const rejecting = new Set<PayoutGuardrailReason>([
    "INVALID_AMOUNT", "INVALID_CURRENCY", "INSUFFICIENT_TREASURY_LIQUIDITY", "DAILY_LIMIT_EXCEEDED"
  ]);
  const action: PayoutGuardrailAction = reasons.some(reason => rejecting.has(reason))
    ? "reject" : reasons.length > 0 ? "hold_for_review" : "allow_for_authorized_execution";
  return { action, reasons, amountMinor: input.amountMinor, currency: input.currency, evaluatedAt: input.now };
}
