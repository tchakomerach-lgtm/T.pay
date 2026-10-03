import type { UUID } from "../../domain/src/types.js";

export type PasskeyAssurance = "user_presence" | "user_verification";

export interface PasskeyCredential {
  id: UUID;
  userId: UUID;
  credentialId: string;
  publicKey: string;
  counter: bigint;
  transports: readonly ("usb"|"nfc"|"ble"|"internal")[];
  assurance: PasskeyAssurance;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface PasskeyChallenge {
  challenge: string;
  userId: UUID;
  expiresAt: number;
  purpose: "registration" | "authentication" | "step_up";
}

export interface PasskeyVerifier {
  verifyRegistration(input: unknown): Promise<PasskeyCredential>;
  verifyAuthentication(input: unknown): Promise<{ userId: UUID; credentialId: string; newCounter: bigint }>;
}

export function assertFreshChallenge(challenge: PasskeyChallenge, now = Date.now()): void {
  if (now >= challenge.expiresAt) throw new Error("PASSKEY_CHALLENGE_EXPIRED");
}
