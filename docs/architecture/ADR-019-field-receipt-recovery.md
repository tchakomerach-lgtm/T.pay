# ADR-019 — Field receipt synchronization and recovery

**Status:** Proposed — construction sequence L6.4

Field receipts are evidence of an offline envelope, not financial authorization. Receipt identity is deterministic from organization, envelope, device, sequence and payload hash. Recovery is idempotent and bounded; terminal rejection/quarantine never posts or corrects Ledger state.

A recovered receipt may be re-verified after process/device interruption. Duplicate verification is safe because terminal states are sticky. Cross-tenant identity is bound into the deterministic receipt ID and server-side evidence contract.
