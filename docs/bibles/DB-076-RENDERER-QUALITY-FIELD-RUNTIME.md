# DB-076 — Renderer Quality & Field Runtime

## Objective
Transform DB-075 from a functional renderer into a field-safe rendering runtime without creating a second Design System.

## Implemented
- deterministic viewport classification;
- adaptive density;
- browser online/offline detection;
- explicit offline mode;
- reduced-motion enforcement;
- canonical Design Registry → CSS variable adapter;
- renderer Error Boundary;
- accessible failure surface;
- contract tests for token and field boundaries.

## Field behavior
### Online
Normal data refresh and full presentation.

### Reconnecting
Preserve the last stable screen and clearly expose reconnection state. Never fabricate fresh data.

### Offline
No remote loading claim, no auto-refresh, no authoritative success claim. Local actions must remain distinguishable from server-confirmed actions.

### Low bandwidth
Prefer text and essential controls; reduce heavy media and unnecessary refresh.

### Reduced motion
No essential information may depend on animation.

## Failure containment
A renderer crash is isolated to the presentation boundary. It must not silently retry financial or consequential actions. Sensitive payloads are not logged by the Error Boundary.

## Architecture invariant
`apps/design/*` remains authoritative. React consumes contracts; it does not define business authorization, financial state, security policy or competing visual tokens.

## Verification gate
DB-076 is IMPLEMENTED/PENDING-VERIFICATION until exact-head CI, browser build, accessibility automation, visual regression, low-end performance and security review produce evidence.

## Accessibility gate
The renderer now has an executable accessibility contract requiring a named surface, live-region support, keyboard reachability, visible focus, minimum 44px controls, and text/icon status semantics. These are contracts; browser-level automated accessibility scanning remains a separate verification gate.
