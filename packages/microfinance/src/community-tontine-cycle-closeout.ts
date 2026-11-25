import { createHash } from "node:crypto";
import type { UUID } from "../../domain/src/types.js";

export interface CycleRefundShare {
  memberId: UUID;
  grossRefundableMinor: bigint;
  otherContractualDeductionsMinor: bigint;
}
export interface CycleCloseoutInput {
  organizationId: UUID;
  groupId: UUID;
  cycleId: UUID;
  currency: string;
  shares: readonly CycleRefundShare[];
  tpayCommissionMinor: bigint;
  microfinanceCommissionMinor: bigint;
  earnedInsurancePremiumMinor: bigint;
  approvedClaimsMinor: bigint;
  incidentCount: number;
  allPaymentsReconciled: boolean;
  allDisputesResolved: boolean;
  allCallbacksFinal: boolean;
  reservesSufficient: boolean;
  contractualHoldExpired: boolean;
}
export interface CycleRefundAllocation {
  memberId: UUID;
  grossShareMinor: bigint;
  tpayCommissionMinor: bigint;
  microfinanceCommissionMinor: bigint;
  otherDeductionsMinor: bigint;
  netRefundMinor: bigint;
}
export interface CycleCloseoutSnapshot {
  organizationId: UUID;
  groupId: UUID;
  cycleId: UUID;
  currency: string;
  grossRefundableMinor: bigint;
  tpayCommissionMinor: bigint;
  microfinanceCommissionMinor: bigint;
  earnedInsurancePremiumMinor: bigint;
  approvedClaimsMinor: bigint;
  otherContractualDeductionsMinor: bigint;
  netRefundMinor: bigint;
  calculationHash: string;
  idempotencyKey: string;
  allocations: readonly CycleRefundAllocation[];
}

function requireNonNegative(value: bigint, code: string): void {
  if (value < 0n) throw new Error(code);
}
function allocateProRata(total: bigint, shares: readonly CycleRefundShare[]): Map<UUID, bigint> {
  const gross = shares.reduce((sum, share) => sum + share.grossRefundableMinor, 0n);
  const result = new Map<UUID, bigint>();
  if (total === 0n) {
    for (const share of shares) result.set(share.memberId, 0n);
    return result;
  }
  if (gross <= 0n || total > gross) throw new Error("TONTINE_CLOSEOUT_ALLOCATION_EXCEEDS_GROSS");
  let allocated = 0n;
  const ranked = shares.map(share => {
    const numerator = total * share.grossRefundableMinor;
    const floor = numerator / gross;
    result.set(share.memberId, floor);
    allocated += floor;
    return { memberId: share.memberId, remainder: numerator % gross };
  }).sort((a,b) => a.remainder === b.remainder
    ? String(a.memberId).localeCompare(String(b.memberId))
    : a.remainder > b.remainder ? -1 : 1);
  let remaining = total - allocated;
  for (let i = 0; remaining > 0n; i += 1, remaining -= 1n) {
    const member = ranked[i % ranked.length]!;
    result.set(member.memberId, (result.get(member.memberId) ?? 0n) + 1n);
  }
  return result;
}

/**
 * Calculates a deterministic refund-only closeout. It does not create a Payment Intent,
 * reserve funds or post Ledger entries. A Financial Core batch must independently
 * re-read and lock the cycle, allocations, balances and fee snapshots before execution.
 */
export function calculateCommunityTontineCycleCloseout(input: CycleCloseoutInput): CycleCloseoutSnapshot {
  if (!input.organizationId || !input.groupId || !input.cycleId) throw new Error("TONTINE_CLOSEOUT_SCOPE_REQUIRED");
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error("TONTINE_CLOSEOUT_CURRENCY_INVALID");
  if (!Number.isInteger(input.incidentCount) || input.incidentCount < 0) throw new Error("TONTINE_CLOSEOUT_INCIDENT_COUNT_INVALID");
  for (const [value, code] of [
    [input.tpayCommissionMinor,"TPAY_COMMISSION_INVALID"],
    [input.microfinanceCommissionMinor,"MICROFINANCE_COMMISSION_INVALID"],
    [input.earnedInsurancePremiumMinor,"INSURANCE_PREMIUM_INVALID"],
    [input.approvedClaimsMinor,"APPROVED_CLAIMS_INVALID"]
  ] as const) requireNonNegative(value, "TONTINE_CLOSEOUT_" + code);
  if (input.shares.length === 0) throw new Error("TONTINE_CLOSEOUT_NO_REFUND_SHARES");
  const memberIds = input.shares.map(x => String(x.memberId));
  if (new Set(memberIds).size !== memberIds.length) throw new Error("TONTINE_CLOSEOUT_DUPLICATE_MEMBER");
  for (const share of input.shares) {
    requireNonNegative(share.grossRefundableMinor, "TONTINE_CLOSEOUT_GROSS_SHARE_INVALID");
    requireNonNegative(share.otherContractualDeductionsMinor, "TONTINE_CLOSEOUT_OTHER_DEDUCTION_INVALID");
  }
  if (input.incidentCount !== 0) throw new Error("TONTINE_CLOSEOUT_INCIDENTS_OPEN");
  if (!input.allPaymentsReconciled) throw new Error("TONTINE_CLOSEOUT_PAYMENTS_UNRECONCILED");
  if (!input.allDisputesResolved) throw new Error("TONTINE_CLOSEOUT_DISPUTES_OPEN");
  if (!input.allCallbacksFinal) throw new Error("TONTINE_CLOSEOUT_CALLBACKS_PENDING");
  if (!input.reservesSufficient) throw new Error("TONTINE_CLOSEOUT_RESERVES_INSUFFICIENT");
  if (!input.contractualHoldExpired) throw new Error("TONTINE_CLOSEOUT_CONTRACTUAL_HOLD_ACTIVE");

  const gross = input.shares.reduce((sum, x) => sum + x.grossRefundableMinor, 0n);
  const other = input.shares.reduce((sum, x) => sum + x.otherContractualDeductionsMinor, 0n);
  const deductions = input.tpayCommissionMinor + input.microfinanceCommissionMinor + other;
  if (deductions > gross) throw new Error("TONTINE_CLOSEOUT_DEDUCTIONS_EXCEED_REFUNDABLE");
  const tpay = allocateProRata(input.tpayCommissionMinor, input.shares);
  const mf = allocateProRata(input.microfinanceCommissionMinor, input.shares);
  const allocations = input.shares.map(share => {
    const tpayFee = tpay.get(share.memberId) ?? 0n;
    const mfFee = mf.get(share.memberId) ?? 0n;
    const net = share.grossRefundableMinor - tpayFee - mfFee -
      share.otherContractualDeductionsMinor;
    if (net < 0n) throw new Error("TONTINE_CLOSEOUT_MEMBER_NET_NEGATIVE");
    return {
      memberId: share.memberId,
      grossShareMinor: share.grossRefundableMinor,
      tpayCommissionMinor: tpayFee,
      microfinanceCommissionMinor: mfFee,
      otherDeductionsMinor: share.otherContractualDeductionsMinor,
      netRefundMinor: net
    };
  });
  const allocationGross = allocations.reduce((sum,x)=>sum+x.grossShareMinor,0n);
  const allocationNet = allocations.reduce((sum,x)=>sum+x.netRefundMinor,0n);
  if (allocationGross !== gross || allocationNet !== gross - input.tpayCommissionMinor -
      input.microfinanceCommissionMinor - other) {
    throw new Error("TONTINE_CLOSEOUT_ALLOCATION_RECONCILIATION_FAILED");
  }
  const canonical = JSON.stringify({
    organizationId:input.organizationId,groupId:input.groupId,cycleId:input.cycleId,currency:input.currency,
    gross:gross.toString(),tpay:input.tpayCommissionMinor.toString(),microfinance:input.microfinanceCommissionMinor.toString(),
    insurancePremium:input.earnedInsurancePremiumMinor.toString(),claims:input.approvedClaimsMinor.toString(),
    other:other.toString(),allocations:allocations.slice().sort((a,b)=>String(a.memberId).localeCompare(String(b.memberId)))
      .map(x=>({memberId:x.memberId,gross:x.grossShareMinor.toString(),tpay:x.tpayCommissionMinor.toString(),
        microfinance:x.microfinanceCommissionMinor.toString(),other:x.otherDeductionsMinor.toString(),net:x.netRefundMinor.toString()}))
  });
  const hash=createHash("sha256").update(canonical).digest("hex");
  return {
    organizationId:input.organizationId,groupId:input.groupId,cycleId:input.cycleId,currency:input.currency,
    grossRefundableMinor:gross,tpayCommissionMinor:input.tpayCommissionMinor,
    microfinanceCommissionMinor:input.microfinanceCommissionMinor,
    earnedInsurancePremiumMinor:input.earnedInsurancePremiumMinor,approvedClaimsMinor:input.approvedClaimsMinor,
    otherContractualDeductionsMinor:other,
    netRefundMinor:gross-deductions,calculationHash:hash,
    idempotencyKey:"tontine-cycle-closeout:"+input.organizationId+":"+input.cycleId+":"+hash,
    allocations
  };
}
