# T.Pay Secure API Adapter

This adapter is the first real HTTPS boundary between a client and the existing API Gateway runtime policies.

Alpha scope:
- TLS 1.3 only.
- /v1/health is public.
- Other routes pass through API version, route authorization and rate-control gates.
- No real identity or financial settlement is exposed.
- No HTTP listener is provided.

The in-memory rate database is deliberately an Alpha test adapter. Production must replace it with the PostgreSQL repository and migrations before real traffic is enabled.
