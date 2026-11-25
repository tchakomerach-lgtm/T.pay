import test from "node:test";
import assert from "node:assert/strict";
import type { UUID } from "../packages/domain/src/types.js";
import type {
  CreateSocialPublicationCommand,
  SocialAuthorization,
  SocialOutboxEvent,
  SocialPublication,
  SocialPublicationRepository
} from "../packages/social/src/contracts.js";
import {
  assertPublicationCanBeShownToSurface,
  createSocialPublication
} from "../packages/social/src/service.js";

const actor = "user-1" as UUID;
const organization = "org-1" as UUID;
const otherOrganization = "org-2" as UUID;

function command(overrides: Partial<CreateSocialPublicationCommand> = {}): CreateSocialPublicationCommand {
  return {
    actorUserId: actor,
    sourceOrganizationId: organization,
    kind: "post",
    contentClass: "public_safe",
    visibility: "public",
    surfaces: ["organization_social", "global_social"],
    title: "Annonce publique",
    body: "Contenu validé pour diffusion publique.",
    idempotencyKey: "request-001",
    ...overrides
  };
}

function dependencies(allowed = true) {
  const records = new Map<string, SocialPublication>();
  const events: SocialOutboxEvent[] = [];
  const calls: string[] = [];
  const repository: SocialPublicationRepository = {
    async findByIdempotencyKey(key) { return records.get(key); },
    async insertPublicationAndOutbox(input) {
      if (records.has(input.idempotencyKey)) throw new Error("SOCIAL_IDEMPOTENCY_CONFLICT");
      records.set(input.idempotencyKey, input.publication);
      events.push(input.outboxEvent);
    }
  };
  const authorization: SocialAuthorization = {
    async assertAllowed(request) {
      calls.push(request.permission);
      if (!allowed) throw new Error("AUTHORIZATION_DENIED");
    }
  };
  let sequence = 0;
  return {
    repository,
    authorization,
    ids: { next: () => `generated-${++sequence}` as UUID },
    clock: { now: () => "2026-11-18T10:00:00.000Z" },
    records,
    events,
    calls
  };
}

test("organization publication can be explicitly syndicated to the global social feed", async () => {
  const deps = dependencies();
  const publication = await createSocialPublication(command(), deps);
  assert.deepEqual(publication.surfaces, ["organization_social", "global_social"]);
  assert.equal(publication.status, "published");
  assert.deepEqual(deps.calls, ["social.publish.global", "social.publish.organization"]);
  assert.equal(deps.events.length, 1);
  assert.equal(deps.events[0]?.aggregateId, publication.id);
});

test("HR confidential, health-sensitive and financial content cannot enter social surfaces", async () => {
  for (const contentClass of ["hr_confidential", "health_sensitive", "financial"] as const) {
    const deps = dependencies();
    await assert.rejects(
      createSocialPublication(command({ contentClass }), deps),
      /SOCIAL_RESTRICTED_CONTENT_BLOCKED/
    );
    assert.equal(deps.events.length, 0);
  }
  const personal = dependencies();
  await assert.rejects(
    createSocialPublication(command({ contentClass: "personal" }), personal),
    /SOCIAL_PERSONAL_CONTENT_BLOCKED/
  );
  assert.equal(personal.events.length, 0);
});

test("organization-internal content cannot be syndicated globally or to Opportunity", async () => {
  const deps = dependencies();
  await assert.rejects(
    createSocialPublication(command({ contentClass: "organization_internal" }), deps),
    /SOCIAL_GLOBAL_CONTENT_CLASS_BLOCKED/
  );
  await assert.rejects(
    createSocialPublication(command({
      kind: "job",
      surfaces: ["opportunity"],
      contentClass: "organization_internal",
      approvalRef: "hr-approved"
    }), dependencies()),
    /OPPORTUNITY_CONTENT_CLASS_BLOCKED/
  );
});

test("organization-only publication is not visible in another organization", async () => {
  const deps = dependencies();
  const publication = await createSocialPublication(command({
    surfaces: ["organization_social"],
    visibility: "organization_only",
    contentClass: "organization_internal"
  }), deps);
  assert.throws(
    () => assertPublicationCanBeShownToSurface(publication, "organization_social", { viewerUserId: "viewer-1" as UUID, viewerOrganizationId: otherOrganization }),
    /SOCIAL_ORGANIZATION_SCOPE_MISMATCH/
  );
  assert.doesNotThrow(
    () => assertPublicationCanBeShownToSurface(publication, "organization_social", { viewerUserId: "viewer-1" as UUID, viewerOrganizationId: organization })
  );
});

test("opportunity publication requires organization context, public-safe content and HR approval", async () => {
  const deps = dependencies();
  const publication = await createSocialPublication(command({
    kind: "job",
    surfaces: ["opportunity"],
    visibility: "public",
    approvalRef: "hr-approval-2026-001"
  }), deps);
  assert.equal(publication.status, "published");
  assert.ok(deps.calls.includes("opportunity.publish"));
  assert.ok(deps.calls.includes("opportunity.publish.approved"));
  await assert.rejects(
    createSocialPublication(command({
      kind: "job",
      surfaces: ["opportunity"],
      visibility: "public"
    }), dependencies()),
    /OPPORTUNITY_HR_APPROVAL_REQUIRED/
  );
});

test("authorization is checked before publication and outbox persistence", async () => {
  const deps = dependencies(false);
  await assert.rejects(createSocialPublication(command(), deps), /AUTHORIZATION_DENIED/);
  assert.equal(deps.events.length, 0);
  assert.equal(deps.records.size, 0);
});
