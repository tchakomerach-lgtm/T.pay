# ADR-003 — Organization-owned branding synchronization

## Decision
T.Pay has two distinct branding layers:
1. **Platform brand**: T.Pay Family 01/02. This identifies the T.Pay product and remains stable.
2. **Organization brand**: a tenant-owned logo that can be uploaded by the founder or generated through a controlled T.Pay branding flow.

The organization logo never replaces the T.Pay platform identity at trust-critical boundaries. It is presentation data scoped to one organization.

## Lifecycle
`draft/requested -> pending_scan -> active -> archived/rejected`

A logo cannot become active directly from an untrusted upload. The backend must sanitize/scan it first and produce a safe derivative plus SHA-256 content hash.

Each replacement increments `version`. The active-logo pointer, archive of the previous logo, new logo record and branding version must be committed atomically.

## Automatic synchronization
Organization-owned branding is resolved centrally by a branding registry/resolver. Organization modules never store arbitrary logo paths.

Surfaces include:
- public organization page and website
- ERP/CRM and internal portal
- Wallet and organization finance views
- schools, microfinance and other vertical modules
- marketplace, social and opportunity pages
- bulletins, receipts, reports and administrative documents
- notifications and printable/exported documents where organization branding is permitted

The same active organization logo version is used for a rendered artifact. Documents may embed a safe immutable asset reference so later logo changes do not silently alter an already-issued historical document.

## Security construction gate
Threats:
- malicious SVG active content
- cross-organization logo access
- storage reference disclosure
- confused-deputy branding updates
- stale/cached logos after replacement
- logo used as a fake payment/security proof
- partial replacement leaving no active logo

Controls:
- organization authorization on every branding write/read
- safe derivative only for rendering
- no scripts, event handlers, external references or active SVG content
- content-type and magic-byte validation
- size/dimension limits and malware/content scanning
- versioned immutable asset references
- CDN/cache keys include organization + logo version
- atomic replacement transaction
- T.Pay fallback if logo is unavailable
- branding is never an authorization, identity, payment or security signal

## Acceptance criteria
- Founder can upload or generate an organization logo.
- An unscanned/untrusted asset cannot become active.
- Replacing a logo preserves the previous version for historical documents.
- All supported organization surfaces resolve the same active logo version through one resolver.
- Cross-organization reads/writes are rejected.
- A failed replacement leaves the previous active logo intact.
- CI tests the lifecycle, authorization boundary and fallback behavior.