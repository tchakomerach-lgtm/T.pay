# TPAY-TOGO-PILOT-001 — Field Pilot Acceptance Contract

Status: proposal for review; not a production authorization.
Date: 2026-10-29

## Purpose

Translate the T.Pay OS strategy into a bounded, measurable field pilot in Togo. This document is an acceptance contract for selecting and evaluating a pilot; it does not replace the product Bibles, production readiness gates, regulatory review, or implementation tests.

## Mandatory construction references

- `AGENTS.md`
- `docs/bibles/IMPLEMENTATION-MAP.md`
- `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/production/TPAY-PRODUCTION-READINESS-GATES.md`
- `docs/compliance/TPAY-MOBILE-MONEY-CONTRACT-ACTIVATION.md`
- Relevant Organization, Education, Finance, Microfinance, Security, Auth, Design and AI Bibles before any implementation affecting those domains.

## Pilot scope

Start with one bounded organization workflow and a small, explicitly consenting cohort. The pilot can include:
- Organization setup, named roles and server-enforced permissions.
- One end-to-end non-financial workflow such as school administration or small-business records.
- Payment integration only in provider sandbox until a current signed provider contract, legal approval, signature verification, reconciliation and all production gates are evidenced.
- A visible distinction between demo data, sandbox transactions and real production data.

Do not activate all modules at once. Do not promise credit, grants, income, employment, or financial returns. School Subsidy must follow the current T.Pay definition and its own financial/legal review; it must not be represented as an unpaid donation.

## Non-negotiable safety invariants

1. HTTPS only; no HTTP fallback.
2. Every organization-owned request is authorized server-side against the active tenant and session. Client-side hiding is not authorization.
3. Deny by default; least privilege; auditable role changes and revocation.
4. A single canonical financial ledger. Domain modules do not mutate balances directly.
5. Financial effects require durable idempotency, atomic database transactions, replay protection, provider correlation, amount/currency matching and reconciliation.
6. No successful financial result is inferred while offline or from an unverified callback.
7. Secrets, OTPs, credentials, raw KYC material and payment secrets are never written to application logs.
8. AI agents use the AI Core/provider adapters and explicit tool permissions. Sensitive actions require human approval.
9. No production claim until CI passes on the exact candidate SHA and the relevant security, PostgreSQL, backup/restore and field tests have evidence.

## Pilot measurement plan

Capture a baseline before onboarding and compare it with the pilot period. Do not invent target values before baseline collection.

| Area | Measure | Evidence |
|---|---|---|
| Usability | Task completion rate and median completion time | Observed task sessions, anonymized event counts |
| Administration | Time spent per recurring task; correction rate | Before/after sample and audit events |
| Reliability | Availability, error rate, recovery time | Structured metrics and incident records |
| Access control | Unauthorized and cross-tenant attempts denied | Automated negative tests and security logs |
| Finance (sandbox first) | Duplicate effects, unmatched callbacks, reconciliation differences | PostgreSQL integration results and reconciliation report |
| Adoption | Weekly active organizations and retained users | Privacy-minimized usage analytics |
| Inclusion | Completion on low-cost Android devices and weak networks | Device/network test matrix |
| AI (if enabled) | Correctness, unsafe-action blocks, human override rate and cost per task | Evaluation set, policy-decision logs and cost report |

Each metric must have an owner, measurement window, data source, baseline, target approved before the pilot, and an explicit stop condition.

## Entry gates

A pilot may begin only when all applicable items are evidenced:
- A named pilot owner, participating organization and informed participant consent.
- Documented data inventory, purpose, retention and access policy.
- Current threat model and reviewed permission matrix.
- Automated authentication, authorization, tenant-isolation and audit tests.
- PostgreSQL migrations and concurrent/idempotency tests run successfully on the candidate SHA.
- CI checks pass on that exact SHA; no required check is skipped or disabled.
- Recovery, backup and rollback procedures are documented and tested for any persistent data change.
- Accessibility, Android and poor-network behavior are tested for the chosen workflow.
- Finance and legal gates are approved before any real-money feature is enabled.

## Stop conditions

Immediately suspend the affected workflow if any of the following occurs:
- Cross-tenant data exposure or privilege escalation.
- Duplicate or unbalanced ledger effect, unexplained reconciliation mismatch, or unverifiable provider event.
- Secrets or sensitive personal data exposed in logs or to an unauthorized actor.
- Loss of auditability, inability to restore data, or unexplained persistent corruption.
- CI or monitoring evidence cannot be tied to the exact deployed SHA.
- Participants cannot understand the status, fees, consent, or limitations of the service.

Preserve evidence, prevent additional effects, notify the designated incident owner, and resume only after documented remediation and re-approval.

## Exit criteria

The pilot report must include:
- Exact source commit, deployment identifier and test evidence.
- Participating cohort and dates, without unnecessary personal data.
- Baseline-versus-pilot results for every agreed metric.
- Incidents, unresolved defects, user feedback and total operating cost.
- Security and financial reconciliation outcomes, where applicable.
- A decision: stop, repeat with changes, expand to another cohort, or request production review.

Passing this pilot does not by itself grant financial authorization or certify the entire T.Pay platform.
