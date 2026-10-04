# ADR-023 — Microfinance integration boundary

T.Pay integrates partner microfinance institutions through explicit adapters and does not duplicate their regulated accounting. Client accounts are references to partner accounts; T.Pay Financial Core records its own canonical transactions only.

Field collection supports cash and digital rails, with configurable routing and graceful provider fallback. Geolocation is evidence/operations metadata, never sole authentication. Tontine minimums and school-recovery minimums are policy-configurable, never hard-coded.

PI-SPI readiness is represented as a capability, not a mandatory assumption, so partner rollout can be progressive.
