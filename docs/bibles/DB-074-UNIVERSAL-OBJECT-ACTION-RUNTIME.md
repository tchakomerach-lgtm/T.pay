# DB-074 — Universal Object & Action Runtime

Status: IMPLEMENTED on `construction/db-074-universal-object-action-runtime`; exact-head CI and renderer integration remain gated.

## Purpose
Convert the Design Bible universal-object/action model into executable, renderer-neutral contracts.

## Team lanes
Architect, Frontend, Realtime, Accessibility, Security, QA, Performance, Cost and Integrator have bounded responsibilities. No lane may weaken authorization or financial invariants.

## Object contract
Every object has identity, context, organization binding when required, lifecycle status, sensitivity, freshness, sync state, version and available actions.

## Presentation contract
Presentation is not authorization. Sensitive objects require explicit redaction with an explanation. Context and lifecycle state remain visible where appropriate.

## Action contract
Consequential and destructive actions cannot silently execute. The UI must expose the action label, preview/confirmation requirements and a human-readable blocked reason.

## Realtime contract
A live update carries freshness, synchronization state, affected fields and an accessible announcement. Whole-screen flashing is forbidden. The renderer must show change without destroying user context.

## Synchronization / field contract
Queued, locally saved, reconnecting and conflict states are distinct. Local state never becomes authoritative merely because it is displayed. Low-bandwidth, low-power and offline modes suppress non-essential media/motion and avoid refresh polling while offline.

## Accessibility
The future renderer must provide programmatic name/role/value, visible focus, keyboard reachability, non-color status and equivalent announcements. WCAG 2.2 explicitly requires accessible names/roles/values for UI components and treats non-text information as an accessibility concern. citeturn0search7turn0search1

## Security boundary
These contracts only describe presentation state. They do not authorize operations, expose hidden sensitive data, or replace server-side policy. This separation is required because UI checks must not become the authoritative security boundary.

## Performance
Contracts are intentionally small and serializable. Renderers should use semantic tokens and avoid duplicated design payloads. Field modes prioritize text/status over large media and disable non-essential animation.

## Completion gate
Not production-ready until targeted tests, exact-head CI, renderer adapters, visual regression, accessibility automation, low-end Android performance evidence and security review are present.