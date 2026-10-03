import type { PaymentStatus } from "./payment.js";

const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  initiated: ["pending", "failed", "cancelled"],
  pending: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: []
};

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`INVALID_PAYMENT_TRANSITION:${from}->${to}`);
}
