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


## Organization-owned branding

T.Pay family 01/02 remains the platform brand. It is never replaced by an organization's logo.

When an organization is created, its founder may upload an existing logo or request a T.Pay-generated organization logo. The organization logo is stored in the organization's branding record and is rendered automatically across organization-controlled surfaces: public page, website, ERP/CRM, Wallet views, school/microfinance interfaces, recruitment, marketplace, bulletins, receipts, reports and administrative documents.

Organization logos are tenant-scoped presentation assets. They do not grant permissions, prove payment, authenticate a user, or alter financial state. An uploaded/generated asset must pass server-side sanitization and malware/content scanning before activation. SVG must be sanitized and stripped of scripts, event handlers, external references and active content; the original upload is retained separately from the safe derivative. Branding changes are versioned and should be committed atomically with the active-logo pointer.

The rendering layer resolves: platform brand -> organization brand (when the surface permits it) -> document-specific layout. Modules must not hard-code organization logo paths. A missing/rejected logo falls back to the T.Pay platform brand without exposing internal storage references.
