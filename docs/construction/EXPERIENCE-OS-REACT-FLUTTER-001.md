# EXPERIENCE-OS-001 — React Web + Flutter Mobile Renderer

Status: renderer foundation implemented; domain API integration remains incremental.
Design source: `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md`, DB-071 and DB-072.
Shared navigation/token contract: `apps/experience-web/design-contract.json`; Flutter consumes its synchronized asset copy.

## Delivered
- New React/Vite responsive T.Pay Experience OS application, isolated from existing School OS and investor prototype.
- Eighteen module workspaces, global module navigation/search, responsive drawer, light/dark theme and visible preview/connection states.
- Flutter mobile application with adaptive navigation, module cards and Material 3 theme.
- Shared versioned navigation and design-token contract mirrored in Flutter assets.
- API clients reject non-HTTPS endpoints, expired sessions, cross-origin path escape and redirects; credentials are memory-only.
- Main CI includes React production build; dedicated Flutter workflow performs analysis, tests and debug APK artifact build.

## Explicit limits
This is the renderer foundation, not full production implementation of all 18 business domains. The current API server is primarily the authenticated Education API. Other module endpoints must be registered and integrated individually. No fabricated balances, customer records, ledger rows or payment confirmations are displayed. Flutter session persistence, login/refresh/revocation, biometrics, offline reconciliation, deep links and push notifications remain separate AUTH/security/platform bricks. Existing Android WebView shell is preserved until native terrain acceptance.

## Commands
- Web: `npm run experience:dev`, `npm run experience:build`
- Mobile: `cd mobile/tpay_flutter && flutter pub get && flutter analyze --fatal-infos && flutter test && flutter build apk --debug`

## Acceptance still required
Real identity/session integration; tenant-scoped API adapters per module; persisted secure token vault; logout/revocation/step-up; device E2E; offline conflict resolution; accessibility/visual regression; low-end Android profiling; release signing and production distribution.
