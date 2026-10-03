import type { UUID } from "../../domain/src/types.js";

export type CredentialStatus = "active" | "revoked" | "locked";
export type CredentialKind = "password" | "passkey" | "recovery";

export interface Credential {
  id: UUID;
  userId: UUID;
  kind: CredentialKind;
  status: CredentialStatus;
  createdAt: string;
  failedAttempts: number;
  lockedUntil?: number;
}

export function assertCredentialUsable(credential: Credential, now = Date.now()): void {
  if (credential.status !== "active") throw new Error("CREDENTIAL_NOT_ACTIVE");
  if (credential.lockedUntil !== undefined && now < credential.lockedUntil) {
    throw new Error("CREDENTIAL_TEMPORARILY_LOCKED");
  }
}
