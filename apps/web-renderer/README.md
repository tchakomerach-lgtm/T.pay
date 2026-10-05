# T.Pay React Renderer — DB-075

This is the first real browser renderer for T.Pay.

Architecture rule:
- `apps/design/*` is the single design-contract source of truth.
- This renderer consumes those contracts; it must not redefine colors, component states, authorization semantics, realtime rules or object semantics.
- Domain/security authorization remains outside the renderer.
- The same semantic contracts are intended to feed a future Flutter adapter.

Run:
- `npm run web:dev`
- `npm run web:build`

The demo is deliberately contract-backed: it validates shell, object, action, realtime, sync and field-mode contracts before rendering.
