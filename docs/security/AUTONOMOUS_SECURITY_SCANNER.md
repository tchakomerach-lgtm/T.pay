# TASS — T.Pay Autonomous Security Scanner

TASS is an evidence-producing security subsystem, never the sole release authority.

## Scan levels
S0 inventory → S1 passive → S2 safe active → S3 authenticated → S4 sandbox exploit validation → S5 emergency production validation only under explicit human authorization.

## Required coverage
Asset/API discovery; dependency/SBOM; secrets; IaC/container; authentication/authorization; tenant isolation; business logic; financial idempotency/concurrency; webhook replay; offline queue integrity; AI prompt injection/tool misuse; RAG poisoning; agent capability escalation; egress; abuse/rate controls.

## Safety constraints
No public destructive exploitation. Synthetic money and synthetic identities only. Production tests must be bounded, reversible and explicitly authorized. Findings are signed/traceable evidence. Scanner credentials are least-privilege and isolated from application credentials.

## Release behavior
Critical unresolved findings block release. Exceptions require owner, reason, expiry, compensating control and independent approval. TASS itself cannot disable CI gates, modify its own policy, or mark a finding safe without evidence.
