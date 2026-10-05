# DB-073 — Design Runtime Foundation

This brick converts the Design Bible into renderer-neutral executable TypeScript contracts because the current repository does not yet contain a browser/mobile rendering application.

## Implemented
- versioned canonical design tokens;
- motion, spacing, shape and touch-target primitives;
- universal UI state grammar;
- real-time freshness/synchronization/conflict invariants;
- personal/organization/team/project/field context separation;
- universal action contract;
- accessibility contract requiring label + status text + icon;
- deterministic tests for invalid combinations.

## Field behavior
- offline never masquerades as synchronized;
- conflict cannot be represented without an explicit conflict count;
- blocked actions require a user-facing explanation;
- non-personal contexts require organization binding;
- 44px minimum touch target is enforced by contract;
- reduced-motion compatibility is explicit.

## Renderer migration
Web/mobile renderers should consume these contracts instead of duplicating token values or inventing state names. The first renderer implementation must add adapters for CSS/native tokens, not change domain semantics.

## Security boundary
These are UX contracts only. Server authorization, financial controls, AI tool controls and audit remain authoritative outside the renderer.

## Gate status
IMPLEMENTED. VERIFIED only after exact-head CI. Not PRODUCTION-READY.
