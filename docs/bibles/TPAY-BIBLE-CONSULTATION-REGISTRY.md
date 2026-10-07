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
| Cross-domain feature | all affected domain references before implementation |

## Consultation rule
A new brick must not create a competing rule when a Bible already defines the behavior. If a new requirement genuinely changes the product, update the source Bible/ADR first or in the same coherent change, then implement against the updated source.

## Research rule
When external research is needed, prefer primary sources and record the version/date. Current external security guidance can evolve independently of T.Pay; external guidance informs the design but does not silently override product policy.

## Review rule
Security and finance gates have veto authority for their respective risks. The integrator resolves conflicts explicitly in an ADR rather than bypassing a gate.

| Super Admin, Root Trust, privileged access, cyber recovery | `docs/skills/TPAY-SUPER-ADMIN-001.md` + Super Admin Bible Prompts 003/004/005/007/008 |

| Super Admin Console, runtime governance, maintenance, audit | `apps/web/src/admin-console.ts` + `packages/security/src/admin-runtime.ts` + Prompt 008 runtime/recovery governance |
