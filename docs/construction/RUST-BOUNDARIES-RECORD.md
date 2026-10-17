# Construction record — Rust boundaries pilot

- **Brick:** RUST-BOUNDARIES-001
- **Date:** 2026-10-17
- **Branch:** `construction/super-admin-console-009`
- **Decision:** Rust is accepted for targeted pilots only; no global rewrite and no financial/security authority transfer.
- **ADR:** `docs/architecture/ADR-006-rust-service-boundaries.md`
- **Bible/skill paths consulted:** `AGENTS.md`; `docs/skills/TPAY-CONSTRUCTION-001.md`; `docs/bibles/TPAY-BIBLE-CONSULTATION-REGISTRY.md`; `docs/bibles/IMPLEMENTATION-MAP.md`; `docs/skills/TPAY-SEC-001.md`; root `package.json`.
- **Current code evidence:** Root package is TypeScript/Node.js and has no Rust workspace scripts. A root `Cargo.toml` was not found on the examined branch. This does not prove no nested Rust files exist.
- **External research:** Official Rust Book ownership documentation, Cargo workspace reference, and Rust Reference unsafe documentation were reviewed on 2026-10-17. Rust's memory-safety model is useful but does not enforce business authorization or financial invariants.
- **Threat gate:** No financial ledger authority in Rust; PostgreSQL remains authoritative for transactions/idempotency; secrets remain in server-side secret stores/HSM/KMS; default preference is an isolated local sidecar over FFI; strict input bounds and fail-closed behavior required.
- **Implementation:** ADR created in commit `6919b35067367025f36d7d621d5b07f5ac24fc7b`. No Rust source, dependency or runtime component was added yet, intentionally: the first module must be selected from measured existing bottlenecks and integrated with contract tests.
- **Tests executed:** None for this documentation-only brick. No claim of compilation or runtime verification.
- **CI:** Blocked by the previously observed GitHub Actions job-start anomaly (runner ID 0, empty runner name, no steps). Exact-head CI remains mandatory before declaring completion.
- **Remaining risks:** Root cause of runner startup failure is not established; first Rust pilot selection and benchmark are pending; nested Rust inventory has not yet been exhaustively inspected.
- **Next gate:** Restore a real CI runner, inventory existing modules, choose one bounded deterministic use case, add Rust toolchain/workspace and tests only with a contract and measurable success criterion.
