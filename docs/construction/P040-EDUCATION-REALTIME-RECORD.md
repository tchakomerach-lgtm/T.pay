# P040 — School Realtime Event Stream & Backpressure

## Skills/Bibles consulted
- AGENTS.md
- docs/bibles/IMPLEMENTATION-MAP.md
- docs/skills/TPAY-CONSTRUCTION-001.md
- docs/skills/TPAY-SEC-001.md
- packages/api-gateway/src/policy.ts
- packages/api-gateway/src/https-client.ts
- packages/security/src/webhook.ts
- packages/security/src/provider-callback.ts
- packages/finance/src/provider-contract-adapters.ts

## Decision
Authenticated School SSE is exposed through the existing API Gateway policy boundary. Realtime delivery is tenant + organization isolated, bounded by subscriber queue depth, and requires explicit acknowledgement so slow clients are disconnected and forced to resynchronize rather than accumulating unbounded memory.

## Security gate
- deny-by-default route allowlist
- authenticated tenant context separate from organization context
- no client-supplied tenant/org identity trusted for authorization
- bounded queue/backpressure
- no financial mutation through realtime delivery
- deterministic SSE framing
- HTTPS remains mandatory at external/provider boundaries; no HTTP downgrade
- provider callbacks continue through existing signature/replay primitives

## Tests
- tenant/org isolation
- SSE serialization
- bounded queue overflow
- explicit acknowledgement/backpressure
- API route authorization regression
- full GitHub CI

## CI
Head d89ba0ebfa72d570f4067fcb6d0ae478b0b64515 — GitHub Actions T.Pay CI run 1941: success.

## Remaining risks
- durable cross-process realtime broker is still required before horizontal production scaling
- browser/mobile E2E over real TLS remains a deployment gate
- provider mTLS/HSM-backed credentials remain infrastructure/provider certification gates
