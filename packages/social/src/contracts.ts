import type { UUID } from "../../domain/src/types.js";

export type SocialSurface = "global_social" | "organization_social" | "opportunity";
export type SocialVisibility = "public" | "connections" | "organization_only" | "private";
export type SocialContentClass =
  | "public_safe"
  | "organization_internal"
  | "personal"
  | "hr_confidential"
  | "health_sensitive"
  | "financial";
export type ProfessionalPublicationKind = "post" | "job" | "internship" | "mission" | "service";
export type ProfessionalPublicationStatus = "published" | "pending_approval" | "paused" | "closed";

export interface ProfessionalConnection {
  readonly id: UUID;
  readonly requesterUserId: UUID;
  readonly recipientUserId: UUID;
  readonly status: "pending" | "accepted" | "rejected" | "blocked";
  readonly createdAt: string;
  readonly acceptedAt?: string;
}

export interface ProfessionalSkill {
  readonly code: string;
  readonly label: string;
  readonly visibility: "public" | "connections" | "organization_only" | "private";
  readonly evidenceRef?: string;
  readonly verifiedAt?: string;
  readonly expiresAt?: string;
}

export interface ProfessionalProfile {
  readonly userId: UUID;
  readonly headline?: string;
  readonly summary?: string;
  readonly skills: readonly ProfessionalSkill[];
  readonly discoverability: "public" | "connections" | "hidden";
  readonly updatedAt: string;
}

export interface SocialPublication {
  readonly id: UUID;
  readonly authorUserId: UUID;
  readonly sourceOrganizationId?: UUID;
  readonly kind: ProfessionalPublicationKind;
  readonly contentClass: SocialContentClass;
  readonly visibility: SocialVisibility;
  readonly surfaces: readonly SocialSurface[];
  readonly title: string;
  readonly body: string;
  readonly status: ProfessionalPublicationStatus;
  readonly approvalRef?: string;
  readonly createdAt: string;
  readonly publishedAt?: string;
}

export interface SocialOutboxEvent {
  readonly id: UUID;
  readonly aggregateId: UUID;
  readonly eventType: "social.publication.created" | "social.publication.published";
  readonly occurredAt: string;
  readonly payload: {
    readonly publicationId: UUID;
    readonly authorUserId: UUID;
    readonly surfaces: readonly SocialSurface[];
    readonly sourceOrganizationId?: UUID;
  };
}

export interface CreateSocialPublicationCommand {
  readonly actorUserId: UUID;
  readonly sourceOrganizationId?: UUID;
  readonly kind: ProfessionalPublicationKind;
  readonly contentClass: SocialContentClass;
  readonly visibility: SocialVisibility;
  readonly surfaces: readonly SocialSurface[];
  readonly title: string;
  readonly body: string;
  readonly approvalRef?: string;
  readonly idempotencyKey: string;
}

export interface SocialAuthorizationRequest {
  readonly actorUserId: UUID;
  readonly permission:
    | "social.publish.global"
    | "social.publish.organization"
    | "opportunity.publish"
    | "opportunity.publish.approved";
  readonly organizationId?: UUID;
  readonly resourceId?: UUID;
}

export interface SocialPublicationRepository {
  findByIdempotencyKey(key: string): Promise<SocialPublication | undefined>;
  /** Must atomically persist publication, idempotency key, and outbox event. */
  insertPublicationAndOutbox(input: {
    publication: SocialPublication;
    idempotencyKey: string;
    outboxEvent: SocialOutboxEvent;
  }): Promise<void>;
}

export interface SocialIdGenerator {
  next(): UUID;
}

export interface SocialClock {
  now(): string;
}

export interface SocialAuthorization {
  assertAllowed(request: SocialAuthorizationRequest): Promise<void>;
}
