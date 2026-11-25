# T.Pay OS — Flutter Mobile Renderer

## Prerequisites
- Flutter SDK 3.35.7
- Android SDK / Android Studio
- Java 17

## Run locally
```sh
flutter pub get
flutter analyze --fatal-infos
flutter test
flutter create --platforms=android --org com.tpay --project-name tpay_mobile .
flutter run
```

## Build
```sh
flutter build apk --debug
```

The navigation and token contract is mirrored from `apps/experience-web/design-contract.json`. Run `npm run design:contract:check` from the repository root to detect drift.

## Security boundary
The API client accepts HTTPS only, rejects cross-origin URL escape and redirects, requires an unexpired session and an idempotency key for POST. The first renderer keeps session credentials in memory only. Do not store bearer tokens in preferences, logs or local files. Production login, secure OS-backed token storage, refresh/revocation, step-up authentication and device trust are separate implementation gates.

The mobile shell is a renderer foundation. Module data is not fabricated and domain writes are not enabled until the corresponding authenticated server API and permission contract exist.

## Community Tontine governance

The Flutter workspace supports authenticated commands for:

- Explicit group quorum and approval policy configuration (HTTPS PUT).
- Opening proposals with a JSON payload and UTC closing timestamp.
- Member votes (approve/reject and optional abstention).
- Finalization after the voting window closes.

The screen reads the group policy from `GET /v1/tontine/groups/:groupId/governance/policy`. Every mutation uses an idempotency key and the authenticated API client. A governance decision does not trigger a ledger mutation or payout; financial settlement remains a separate Financial Core workflow.

## Health, Social, RH and Opportunité release boundary

The Health, Social and People/Professional Graph contracts added in this integration are domain foundations only. They are not yet Flutter production screens or live services. Do not expose these modules as active in the mobile navigation until their authenticated APIs, PostgreSQL persistence, organization-scoped RLS, durable outbox, permission checks and end-to-end tests are delivered. Health-sensitive, HR-confidential and financial records must never be projected into public Social or Opportunity surfaces.
