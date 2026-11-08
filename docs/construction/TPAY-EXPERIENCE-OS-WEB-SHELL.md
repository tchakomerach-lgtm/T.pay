# T.Pay Experience OS — shell Web P056.8

## Bible mapping
- `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md` (version 2026.10): Experience OS, global navigation, organization context, motion, low-end responsive layouts, reduced motion, accessibility and event freshness.
- `docs/bibles/IMPLEMENTATION-MAP.md`: cross-domain implementation must reuse existing domain boundaries.
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`: design, security, finance and tontine routing.
- `docs/architecture/ADR-004-community-tontine.md`: Community Tontine remains an independent product domain and never a second ledger.
- `docs/skills/TPAY-MF-002.md`: field microfinance continuity and signed offline intent.
- `docs/skills/TPAY-SEC-001.md`: deny-by-default and server-side authorization.
- `AGENTS.md`: strict TypeScript, no frontend financial truth, domain-specific ownership.

## Delivered in this slice
- Responsive T.Pay OS navigation shell with global brand, workspace context, domain grouping, module launcher and admin/security information surface.
- Module catalogue reflects the Bible's domains: organizations, social, opportunity, independent community tontine, microfinance, education, wallet/payments, marketplace, AI and administration.
- Education remains the only active domain surface in this School Web application. Other domain entries are explicitly marked as catalogued/not connected; selecting them shows an honest integration boundary rather than fabricated data or fake actions.
- Role selector is explicitly an interface preview. It does not grant privileges; server-side authorization remains authoritative.
- Visual system uses the Design Bible emerald/graphite/cloud palette, semantic status treatments, responsive cards, hover/focus feedback, loading/connection pulse and short purposeful transitions.
- `prefers-reduced-motion` disables non-essential movement.
- Mobile navigation is keyboard-focusable and has a labeled menu control.
- Removed external font import to remain compatible with the application's restrictive Content Security Policy and avoid a third-party font dependency.

## Safety and product boundaries
- The shell does not create new domain services, duplicate ledgers or pretend that a catalogue tile is a functional domain.
- Tontine Community is represented as a separate navigation domain from Microfinance, consistent with ADR-004.
- The UI never treats offline intent or SSE notification as proof of settlement.
- The demo environment has no real API or financial mutation.
- The role preview is not an access-control mechanism.
- No UI-only permissions are trusted for writes; APIs must enforce tenant, actor, resource, action and temporal scope.

## Remaining design/engineering work
1. Recover the authoritative DB-074 contract before introducing a shared Web/Mobile renderer boundary.
2. Extract the shell into the canonical shared UI package after DB-074 is restored; this first integration is scoped to the existing School Web application.
3. Connect each module tile only after its API, route authorization, loading/error/offline states, audit and integration tests exist.
4. Add accessibility automation, responsive visual regression and real low-end Android device tests.
5. Build distinct member, organization-admin and super-admin command surfaces from policy-derived capabilities, not client-selected roles.

## Validation status
This commit contains UI implementation only. No local browser run, screenshot comparison, accessibility suite, Web build, Android build or CI success is claimed. Verify the exact PR head in CI before merging.
