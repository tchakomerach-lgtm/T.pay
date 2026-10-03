export type StepUpMethod = "passkey" | "strong_otp" | "admin_approval";

export interface StepUpProof {
  method: StepUpMethod;
  subjectId: string;
  issuedAt: number;
  expiresAt: number;
  operation: string;
  nonce: string;
}

export function assertStepUpValid(
  proof: StepUpProof,
  operation: string,
  now = Date.now()
): void {
  if (proof.operation !== operation) throw new Error("STEP_UP_OPERATION_MISMATCH");
  if (now >= proof.expiresAt) throw new Error("STEP_UP_EXPIRED");
  if (proof.expiresAt <= proof.issuedAt) throw new Error("STEP_UP_INVALID_WINDOW");
}
