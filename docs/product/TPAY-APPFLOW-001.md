# T.Pay OS — APPFLOW-001

## Route map
/home; /organizations; /organizations/:orgId; /social; /opportunities; /tontine; /wallet; /notifications; /search; /settings/security; /help; /auth/*. Routes are illustrative contracts: do not expose protected routes unless capability and backend endpoint exist.

## Authentication/session
Open app → neutral loading shell → validate session and actor → fetch authorized navigation. Missing/expired session routes to sign-in and clears protected in-memory state. Forbidden access shows a safe denial without privilege escalation. Session revocation waits for server confirmation. Organization switch clears old scoped caches and refetches permissions before sensitive rendering.

## Organization creation
Choose type → enter profile → validate client-side for feedback and server-side for authority → preview brand/slug/modules → submit with idempotency key → show pending until durable response → complete required verification → open workspace. Invite codes are short-lived, revocable and rate-limited; they are not identity proof alone.

## Feed/social
Load cursor page → loading skeleton → ordered results or empty state. Load-more uses opaque next cursor and prevents duplicate requests. Network errors may preserve safe cached read-only content with freshness timestamp. Mutations enforce permissions, bounded content and idempotency. Realtime events are scope-checked and deduplicated. Hidden resources must not leak through error details.

## Opportunity
Search/filter → detail with source, status, expiry and verification → apply/contact only if the capability exists. Expired or unverified records explain why an action is disabled. Listings never imply guaranteed employment, investment or payment.

## Community tontine
Review rules, cycle, currency, fees, governance and payout policy → request membership → server eligibility check → create contribution intent → confirm amount/destination → submit idempotent payment intent. States may include draft, pending_provider, confirmed, posted, reconciliation_required, failed and cancelled according to backend support. Never treat a client redirect as proof of payment. Unknown outcomes go to status check/reconciliation, not blind retry.

## Wallet/finance
Display authorized ledger-derived balances. Before transfer/withdrawal/payout, server revalidates session, permission, available funds, limits, beneficiary and risk policy. UI shows fees and exact destination before confirmation. After submit, stay pending until durable outcome is known. Provider timeout is “verification in progress,” not false failure. Refunds are new audited events, never deletion of original ledger entries.

## Organization workspace
Confirm membership and effective permissions before rendering. Show only enabled modules. Role editor explains permission impact; privileged changes require step-up and audit. Branding uploads are size/type checked, scanned, sanitized and versioned, with T.Pay fallback. Member codes are revocable and scoped.

## Error/recovery mapping
400/422: field correction. 401: re-authenticate and clear protected state. 403: deny without retry loop. 404: no hidden-resource disclosure. 409: explain conflict and refresh. 429: honor cooldown. 5xx/network timeout: show correlation ID and retry only safe/idempotent requests. Offline: timestamped read-only cache unless a separately secured mutation queue exists. Expired cursor: restart from fresh cursor and explain refresh.

## AI assistant
Request → resolve authorized tenant/org context → retrieve minimized permitted data → validate proposed tool against allowlist/schema/scope/lease/budget → preview high-impact action and request step-up/human approval → execute via domain service → show durable receipt → emit redacted audit. Model output is never authorization.

## Accessibility and analytics
Keyboard and focus support, semantic labels, live-region announcements, reduced motion and privacy-minimized analytics. Never log tokens, raw identity documents, private message bodies or financial secrets.