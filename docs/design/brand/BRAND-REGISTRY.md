# T.Pay Brand Registry

| Key | Family | Surface |
|---|---|---|
| brand.tpay.family01.primary | 01 | default/core |
| brand.tpay.family02.web | 02 | web/PWA |
| brand.tpay.family02.mobile | 02 | mobile |
| brand.tpay.family02.document | 02 | reports/bulletins/admin documents |

Logo selection is presentation-only. It never grants permissions, proves identity, validates a transaction or changes a financial state.

Wallet, school, microfinance, bulletin, document, marketplace, social and opportunity modules must resolve logos through this registry rather than hard-coding file paths.

Future brand-lint CI should reject unregistered production SVGs, scripts, external references, unsafe event handlers and unapproved palette tokens.
