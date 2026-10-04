# ADR-027 — School finance orchestration

T.Pay treats school financing as an orchestration domain, not a second financial ledger. The school request records eligibility and obligations; the authorized partner MFI remains responsible for financing/disbursement within its legal and contractual perimeter.

Parent recovery can use Community Tontine or approved collection rails. Recovery intents are idempotent evidence and settle through the existing Financial Core boundary.

## Togo/Africa controls
- Daily recovery can use a configurable local policy minimum (for example 500 XOF), never a hard-coded universal promise.
- School/parent location may assist partner selection but never authorizes credit.
- Cash-first and intermittent connectivity are first-class.
- Tuition and supplies remain separate expense evidence.
- Parent/student identifiers are organization-scoped.
- Fee/commission rules are versioned.
- Failed or ambiguous recovery is quarantined; it is never silently deducted twice.

## Remaining work
Live MFI underwriting/disbursement, supplier settlement, recovery-to-Ledger integration and production UX/notifications remain required.