# T.Pay Social & Professional Graph — Bible 004

Status: IMPLEMENTATION CONTRACT / NOT PRODUCTION CERTIFIED
Scope: Global Social, Organization Social, Internal People/RH and Opportunité T.Pay
Architecture: One identity graph, multiple policy-controlled surfaces

## 1. Product rule

T.Pay does not create separate user networks for each organization. It maintains one professional identity and relationship graph, then exposes context-specific experiences through policy-controlled surfaces.

The four connected surfaces are:
1. Global Social: public or connection-scoped content shared by T.Pay users and communities.
2. Organization Social: private organization feed, teams, announcements and collaboration.
3. People & RH: organization membership, position, skills, onboarding, workforce planning, training and HR workflows.
4. Opportunité: job, internship, mission, service and professional matching across organizations and users.

A user may hold multiple memberships and roles. Membership in one organization never implies membership in another.

## 2. Identity and graph

Identity, account, profile, membership, role, position and employment contract remain distinct concepts.

- Identity/account: canonical user identity from the existing Identity system.
- Professional profile: user-controlled headline, summary, skills, portfolio and discoverability.
- Connection: explicit user-to-user relationship with request, acceptance, rejection and block states.
- Membership: organization-scoped relationship from the canonical Organization/Identity model.
- Position: organization-owned HR record with dates and reporting line.
- Opportunity: organization-owned recruitment or mission record.
- Publication: one content object with one or more authorized delivery surfaces.

No duplicate authentication, session, user, membership or tenant table is permitted.

## 3. Cross-surface publishing

One publication may target multiple surfaces only through an explicit surface list and server-side authorization for each surface.

Examples:
- Internal announcement: Organization Social only.
- Approved public event: Organization Social + Global Social.
- Approved job opening: Opportunité + optionally Global Social.
- Private HR notice: HR workspace only; never a social publication.
- Patient/health/financial records: never Global Social or Opportunité.

Global syndication requires public-safe classification, public visibility and explicit global publish permission. Organization-only content must never be discoverable from the global feed.

## 4. RH and employee privacy

RH remains the authoritative organization-owned system for:
- employee file and contract references;
- position, manager and department;
- recruitment pipeline and interview notes;
- compensation, payroll and bank details;
- attendance, leave and disciplinary records;
- performance reviews and private feedback;
- training and certifications;
- skills and competency evidence;
- onboarding, offboarding and access requests.

Only an explicitly approved, minimized subset may be published to the professional profile: user-authorized skills, certifications, portfolio and public career history. Compensation, payroll, disciplinary, health, identity evidence and private evaluations are never public profile fields.

An employee's public profile does not grant access to internal HR records. A manager's role is scoped to the manager's organization, team and permitted HR actions.

## 5. Opportunité integration

Opportunity types: employment, internship, apprenticeship, contract mission, freelance service, supplier/service offer and professional collaboration.

Workflow:
Draft -> HR/owner review -> Approved -> Published -> Applications -> Shortlist -> Interview -> Decision -> Offer -> Accepted/Declined -> Closed.

Each transition requires the relevant organization-scoped permission, audit record and server-side preconditions. AI may rank or prepare a shortlist only under an approved policy; it cannot autonomously reject candidates or make a hiring decision.

An opportunity published by an organization may be shared to Global Social only when its public-facing copy is approved and classified public-safe. Candidate applications and recruiter notes remain private to the hiring organization and candidate.

## 6. Shared capabilities across Organization OS

CRM, internal social, messaging, people/RH, documents, calendar, workflows, notifications, analytics, AI assistant, partner directory, billing, API integrations and support are reusable organization capabilities. A vertical OS composes these capabilities but does not fork their identity or permissions.

The organization context switcher changes the active policy scope. It does not change the user's canonical identity.

## 7. Authorization and privacy

Every read/write checks:
Actor + Identity + Membership + Role + Permission + Organization + Resource + Action + Time + Purpose.

The capability catalog is descriptive only. The canonical server authorization engine remains authoritative.

- Deny by default.
- No cross-tenant queries without explicit, audited policy.
- No super-admin implicit access to private HR or user content.
- Temporary role grants expire automatically.
- Global Social never reads internal HR tables to populate public profiles.
- Search and recommendations operate on approved public projections, not raw tenant tables.
- Blocking and privacy settings must be honored by feed, search, messaging and recommendations.

## 8. Event and data architecture

Publication writes use an atomic repository transaction:
Publication + idempotency key + transactional outbox event.

Consumers (feed projection, notification, search index, analytics) are asynchronous, replay-safe and idempotent. A failed projection must not roll back an already committed domain transaction; it must be retried from the outbox.

No direct database fan-out from one tenant to another. Global feed projections contain only public-safe, explicitly syndicated fields.

## 9. Monetization

Permitted models, subject to signed contracts and local legal review:
- organization SaaS subscription by seats/modules/usage;
- recruitment workspace subscription for employers;
- optional paid employer tools (ATS, branded careers page, analytics);
- optional candidate premium tools, without pay-to-win ranking;
- service marketplace fees for completed non-regulated services, with clear terms;
- API and integration usage;
- training, verification and support services.

Prohibited:
- selling personal or HR data;
- charging candidates to access an application process;
- selling higher ranking to candidates;
- charging for access to emergency, health or public-service priority;
- charging a fee that changes a hiring decision or guarantees employment.

Financial Core owns invoices, payment intents, ledger entries, commissions and refunds. This Bible defines product boundaries, not accounting.

## 10. Experience and motion

One shared design system and one navigation shell. Context is always visible: Personal / Global Social / Organization / HR / Opportunity.

Use responsive feed cards, profile graph, skill chips, opportunity cards, hiring pipeline and timeline. 3D is restrained to orientation and depth cues (profile graph, organization switch, opportunity journey); never make text or primary actions dependent on 3D.

Motion: 100–260ms for routine transitions, 260–500ms for complex transitions. Provide reduced-motion and low-power modes, skeleton loading, offline drafts, sync state and conflict resolution. React and Flutter must consume the same approved DB-074 contract; no parallel token/component system.

## 11. Delivery gates

This Bible and the first TypeScript contracts do not prove production readiness. Required before activation:
- canonical Identity/Membership/tenant policy integration;
- PostgreSQL schema, constraints, RLS and concurrent isolation tests;
- authorization engine integration and adversarial tests;
- outbox relay, replay and idempotency tests;
- React and Flutter screens using DB-074;
- Web, Android and Flutter end-to-end tests;
- accessibility, low-bandwidth and reduced-motion verification;
- privacy and local legal review.

Until then, capability state remains contract-only. No merge or production certification is authorized by this document.
