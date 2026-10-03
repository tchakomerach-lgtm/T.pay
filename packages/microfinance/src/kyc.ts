export type KycStatus = "not_started" | "pending" | "verified" | "rejected" | "expired";
export type KycDocumentKind = "national_id" | "passport" | "residence_permit" | "other";

export interface KycProfile {
  id: string;
  userId: string;
  status: KycStatus;
  countryCode: string;
  verifiedAt?: string;
  expiresAt?: string;
}

export interface KycDocument {
  id: string;
  profileId: string;
  kind: KycDocumentKind;
  storageRef: string;
  sha256: string;
  capturedAt: string;
  status: "pending" | "accepted" | "rejected";
}

export function assertKycVerified(profile: KycProfile, now = new Date()): void {
  if (profile.status !== "verified") throw new Error("KYC_NOT_VERIFIED");
  if (profile.expiresAt !== undefined && new Date(profile.expiresAt).getTime() <= now.getTime()) {
    throw new Error("KYC_EXPIRED");
  }
}
