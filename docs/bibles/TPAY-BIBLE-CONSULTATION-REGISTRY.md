# T.Pay Bible Consultation Registry

This registry makes the project's Bibles discoverable before implementation and prevents silent divergence between product rules and code.

## Mandatory baseline
- `AGENTS.md`
- `docs/bibles/IMPLEMENTATION-MAP.md`
- `docs/skills/TPAY-CONSTRUCTION-001.md`
- `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md`

## Domain routing
| Change type | Mandatory references |
|---|---|
| Money, balances, fees, payment, ledger | `docs/skills/TPAY-FIN-002.md` + finance architecture/ADR |
| Microfinance, collection, field agent | `docs/skills/TPAY-MF-002.md` + microfinance ADRs |
| Identity, authorization, secrets, abuse | `docs/skills/TPAY-SEC-001.md` + `docs/security/THREAT-MODEL.md` |
| AI, agents, tools, prompts | `docs/skills/TPAY-AI-001.md` + AI Bible |
| Voice, telephony, call automation, appointments | `docs/skills/TPAY-VOICE-001.md` + `docs/bibles/TPAY-AI-PROMPT-020-VOICE-FABRIC.md` + AI + Security skills |
| Authentication/session | `docs/skills/TPAY-AUTH-002.md` |
| Orchestration/workflows | `docs/skills/TPAY-ORCH-001.md` |
| Cost/token/compute | `docs/skills/TPAY-COST-001.md` |
| Organization branding | relevant organization ADR + design/brand registry |
| UX/UI/motion/accessibility | `docs/bibles/TPAY-DESIGN-BIBLE-IMPLEMENTATION.md` |
| Community Tontine | `docs/architecture/ADR-004-community-tontine.md` + MF + FIN + SEC skills |
| Education / School OS | `docs/construction/P038-EDUCATION-SYNC-FABRIC-POSTGRES-RECORD.md`, `docs/construction/P040-EDUCATION-REALTIME-RECORD.md`, current P056/P057 construction records, Education migrations/tests + AUTH + SEC + Design; FIN only at the authorized school-fee boundary |
| Cross-domain feature | all affected domain references before implementation |

## Consultation rule
A new brick must not create a competing rule when a Bible already defines the behavior. If a new requirement genuinely changes the product, update the source Bible/ADR first or in the same coherent change, then implement against the updated source.

## Research rule
When external research is needed, prefer primary sources and record the version/date. Current external security guidance can evolve independently of T.Pay; external guidance informs the design but does not silently override product policy.

## Review rule
Security and finance gates have veto authority for their respective risks. The integrator resolves conflicts explicitly in an ADR rather than bypassing a gate.


## Education and contract-layer coverage
- School OS boundary: Web/Android/PC → authenticated API Gateway → Education Core → PostgreSQL. Financial operations remain exclusively in Financial Core.
- The repository currently has no standalone Education Bible file; the applicable school rules are recorded in the P038/P040 construction records, Education persistence/API code, migrations, tests and cross-domain Bibles. Do not create a parallel school policy without updating the canonical source first.
- The previously defined DB-074 design-contract-layer reference is not present in the current repository tree. Do not invent a replacement contract or a competing Web/Mobile renderer contract; recover/import the authoritative DB-074 source before changing that boundary.
