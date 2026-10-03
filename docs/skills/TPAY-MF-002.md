# TPAY-MF-002 — Field Microfinance Continuity

Client → planned collection → geolocated visit → collection intent → idempotency → payment/ledger posting → receipt → notification.

Client routes are not permanently owned by one agent. Supervisor-controlled reassignment rebuilds routes when an agent is unavailable.

Geolocation is evidence, not sole authorization. Device identity, timestamp, client confirmation and payment reference must be correlated.

Offline collection requires a signed local transaction envelope and later reconciliation. Posted collections are never duplicated; reversals are compensating entries.
