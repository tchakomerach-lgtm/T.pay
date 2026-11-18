import type { UUID } from "../../domain/src/types.js";
import type {
  CreateSocialPublicationCommand,
  SocialAuthorization,
  SocialClock,
  SocialIdGenerator,
  SocialOutboxEvent,
  SocialPublication,
  SocialPublicationRepository,
  SocialSurface
} from "./contracts.js";

const GLOBAL_SAFE_CLASSES = new Set(["public_safe"]);
const VALID_SURFACES = new Set<SocialSurface>([
  "global_social",
  "organization_social",
  "opportunity"
]);

function normalizeText(value: string, maxLength: number, errorCode: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(errorCode);
  return normalized;
}

function assertSurfacePolicy(command: CreateSocialPublicationCommand): void {
  if (command.surfaces.length === 0) throw new Error("SOCIAL_SURFACE_REQUIRED");
  if (new Set(command.surfaces).size !== command.surfaces.length) {
    throw new Error("SOCIAL_SURFACE_DUPLICATE");
  }
  for (const surface of command.surfaces) {
    if (!VALID_SURFACES.has(surface)) throw new Error("SOCIAL_SURFACE_INVALID");
  }

  const organizationSurface = command.surfaces.includes("organization_social");
  const globalSurface = command.surfaces.includes("global_social");
  const opportunitySurface = command.surfaces.includes("opportunity");

  if (organizationSurface && !command.sourceOrganizationId) {
    throw new Error("SOCIAL_ORGANIZATION_CONTEXT_REQUIRED");
  }
  if (globalSurface && !GLOBAL_SAFE_CLASSES.has(command.contentClass)) {
    throw new Error("SOCIAL_GLOBAL_CONTENT_CLASS_BLOCKED");
  }
  if (globalSurface && command.visibility !== "public") {
    throw new Error("SOCIAL_GLOBAL_PUBLIC_VISIBILITY_REQUIRED");
  }
  if (opportunitySurface) {
    if (!command.sourceOrganizationId) throw new Error("OPPORTUNITY_ORGANIZATION_REQUIRED");
    if (!["job", "internship", "mission", "service"].includes(command.kind)) {
      throw new Error("OPPORTUNITY_KIND_INVALID");
    }
    if (command.contentClass !== "public_safe") {
      throw new Error("OPPORTUNITY_CONTENT_CLASS_BLOCKED");
    }
    if (!command.approvalRef?.trim()) throw new Error("OPPORTUNITY_HR_APPROVAL_REQUIRED");
  }
  if (command.contentClass === "hr_confidential"
    || command.contentClass === "health_sensitive"
    || command.contentClass === "financial") {
    throw new Error("SOCIAL_RESTRICTED_CONTENT_BLOCKED");
  }
}

function authorizationRequests(command: CreateSocialPublicationCommand): Parameters<SocialAuthorization["assertAllowed"]>[0][] {
  const requests: Parameters<SocialAuthorization["assertAllowed"]>[0][] = [];
  if (command.surfaces.includes("global_social")) {
    requests.push({ actorUserId: command.actorUserId, permission: "social.publish.global" });
  }
  if (command.surfaces.includes("organization_social")) {
    requests.push({
      actorUserId: command.actorUserId,
      permission: "social.publish.organization",
      organizationId: command.sourceOrganizationId
    });
  }
  if (command.surfaces.includes("opportunity")) {
    requests.push({
      actorUserId: command.actorUserId,
      permission: "opportunity.publish",
      organizationId: command.sourceOrganizationId
    });
    requests.push({
      actorUserId: command.actorUserId,
      permission: "opportunity.publish.approved",
      organizationId: command.sourceOrganizationId
    });
  }
  return requests;
}

/**
 * Creates a publication shared by one or more T.Pay surfaces.
 * Authorization is delegated to the canonical server policy engine.
 * Persistence must atomically include idempotency and transactional outbox.
 */
export async function createSocialPublication(
  command: CreateSocialPublicationCommand,
  deps: {
    repository: SocialPublicationRepository;
    authorization: SocialAuthorization;
    ids: SocialIdGenerator;
    clock: SocialClock;
  }
): Promise<SocialPublication> {
  const idempotencyKey = normalizeText(command.idempotencyKey, 160, "SOCIAL_IDEMPOTENCY_KEY_REQUIRED");
  const existing = await deps.repository.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    if (existing.authorUserId !== command.actorUserId) throw new Error("SOCIAL_IDEMPOTENCY_OWNER_MISMATCH");
    return existing;
  }

  const title = normalizeText(command.title, 180, "SOCIAL_TITLE_INVALID");
  const body = normalizeText(command.body, 20_000, "SOCIAL_BODY_INVALID");
  assertSurfacePolicy(command);

  for (const request of authorizationRequests(command)) {
    await deps.authorization.assertAllowed(request);
  }

  const createdAt = deps.clock.now();
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("SOCIAL_CLOCK_INVALID");
  const publicationId = deps.ids.next();
  const sourceOrganizationId = command.sourceOrganizationId;
  const publication: SocialPublication = {
    id: publicationId,
    authorUserId: command.actorUserId,
    ...(sourceOrganizationId ? { sourceOrganizationId } : {}),
    kind: command.kind,
    contentClass: command.contentClass,
    visibility: command.visibility,
    surfaces: [...command.surfaces],
    title,
    body,
    status: command.surfaces.includes("opportunity") ? "pending_approval" : "published",
    ...(command.approvalRef ? { approvalRef: command.approvalRef } : {}),
    createdAt,
    ...(!command.surfaces.includes("opportunity") ? { publishedAt: createdAt } : {})
  };

  const outboxEvent: SocialOutboxEvent = {
    id: deps.ids.next(),
    aggregateId: publicationId,
    eventType: "social.publication.created",
    occurredAt: createdAt,
    payload: {
      publicationId,
      authorUserId: command.actorUserId,
      surfaces: [...command.surfaces],
      ...(sourceOrganizationId ? { sourceOrganizationId } : {})
    }
  };

  await deps.repository.insertPublicationAndOutbox({
    publication,
    idempotencyKey,
    outboxEvent
  });
  return publication;
}

export function assertPublicationCanBeShownToSurface(
  publication: SocialPublication,
  requestedSurface: SocialSurface,
  viewerOrganizationId?: UUID
): void {
  if (publication.status !== "published" || !publication.surfaces.includes(requestedSurface)) {
    throw new Error("SOCIAL_PUBLICATION_NOT_AVAILABLE");
  }
  if (requestedSurface === "organization_social"
    && (!viewerOrganizationId || viewerOrganizationId !== publication.sourceOrganizationId)) {
    throw new Error("SOCIAL_ORGANIZATION_SCOPE_MISMATCH");
  }
  if (requestedSurface === "global_social"
    && (publication.contentClass !== "public_safe" || publication.visibility !== "public")) {
    throw new Error("SOCIAL_GLOBAL_VISIBILITY_BLOCKED");
  }
}
