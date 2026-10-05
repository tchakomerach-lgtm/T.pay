# DB-075 — T.Pay React Renderer Architecture

## Status
IMPLEMENTED ON BRANCH / CI PENDING. This brick creates the first real browser renderer while preserving DB-073/074 as the sole design contract.

## Architectural decision
The repository is a TypeScript platform core. DB-073/074 intentionally define renderer-neutral contracts first. DB-075 now introduces a real React 19 + Vite browser surface that consumes those contracts directly.

There is no second color system, object model, action grammar, realtime grammar or authorization model in the renderer.

```
T.Pay Design Contracts
  -> tokens / states / context / objects / actions / realtime / sync / field policy
  -> React Renderer Adapter
  -> T.Pay Web UI
```

A future Flutter client must consume the same semantic contracts through a platform adapter. It must not fork the Design Bible.

## Implemented surface
- React 19 entry point.
- Vite production build.
- T.Pay shell with canonical destinations.
- Active personal context.
- Responsive navigation.
- Universal object card.
- Governed action preview/confirmation entry point.
- Realtime freshness presentation.
- Sync/field-mode presentation.
- Low-bandwidth and offline display modes.
- Accessible live status announcements.
- Reduced-motion media query.
- 44px minimum interactive controls.
- Design contract assertions executed before rendering the demo.

## Corrective fixes included
The DB-074 exact-head CI exposed three type errors:
1. missing `tpayTokens` import in realtime semantics;
2. invalid `organizationId: undefined` test fixture under `exactOptionalPropertyTypes`;
3. `screenFlash: false` was too narrow to permit the negative test.

These were corrected before DB-075 renderer work proceeded.

## Security boundary
The browser renderer is presentation-only. It cannot grant authorization, mutate financial state, or bypass server-side policy. Sensitive presentation is redacted by contract; critical actions remain subject to authoritative backend controls.

## Field readiness
No external font or media dependency is required for initial rendering. Low-bandwidth mode reduces nonessential media, offline mode disables auto-refresh, and reduced-motion is respected.

## Definition of Done for DB-075
- exact-head typecheck/build passes;
- browser bundle builds;
- renderer consumes DB-073/074 contracts;
- responsive/accessibility tests are added;
- visual regression and low-end Android evidence are recorded;
- security review confirms renderer cannot become an authorization boundary;
- CI is green.

DB-075 is therefore not declared production-ready until those gates have evidence.
