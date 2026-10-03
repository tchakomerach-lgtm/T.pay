# T.Pay Design System 001 — Modern Fintech Interface

## Brand core

T.Pay remains the product name and visual signature:

**T.Pay** — the wordmark is compact, geometric and highly legible. The existing concept of a green upward arrow integrated with “.pay” is retained and refined rather than replaced.

### Logo rules

- Primary mark: upward arrow + T.Pay wordmark.
- The arrow represents movement, transaction flow and controlled growth.
- Never use the logo as a decorative security badge or as proof of a transaction.
- Minimum clear space: 0.5× the mark height.
- Use vector SVG for production; raster exports are derivatives.
- On dark surfaces use the light/white wordmark variant; on light surfaces use the primary brand mark.
- Do not distort, rotate, add shadows to the logo, or animate the arrow in a way that implies a financial operation occurred.

## Color tokens

The palette is intentionally restrained so finance/security states remain unambiguous.

```text
--tpay-green-500: #16A34A   primary action / positive flow
--tpay-green-600: #15803D   hover / active
--tpay-green-700: #166534   strong brand surface
--tpay-ink-950:   #0B1220   primary text / dark shell
--tpay-slate-700: #334155   secondary text
--tpay-slate-100: #F1F5F9   neutral surface
--tpay-white:     #FFFFFF   clean surface
--tpay-amber-500: #F59E0B   warning / attention
--tpay-red-600:   #DC2626   destructive / rejected
--tpay-blue-600:  #2563EB   informational only
```

Color is never the only status indicator: pair color with icon, text and state label.

## Visual language

- 12-column responsive grid.
- 8px spacing rhythm.
- 14–16px body typography, 12px metadata, 20–32px section titles.
- Radius: 12px standard cards, 16px major surfaces, 999px pills.
- Shadows are subtle and used for elevation, not decoration.
- Dense finance tables use sticky headers and clear numeric alignment.
- Amounts use tabular numerals.
- Critical actions remain visually distinct from navigation.

## Motion system

Motion communicates state, not decoration.

- Page transition: 160–220ms, ease-out.
- Card entrance: 180–260ms with small opacity/translate.
- Button press: 80–120ms.
- Loading: skeleton or progress indicator; never indefinite spinner without status.
- Successful financial posting: restrained confirmation transition; never imply settlement before the backend state is confirmed.
- Error: short shake only for local validation; server rejection uses calm inline error + remediation.
- Reduced-motion preference MUST disable nonessential transforms.

### Financial motion safety

A visual success animation may start only after the server returns the authoritative state. Pending payments use a distinct "pending" state and never masquerade as completed.

## Accessibility

Target WCAG 2.2 AA for user-facing surfaces. Focus states, keyboard navigation, readable contrast and reduced-motion support are mandatory.

## Security UX

- Step-up authentication appears as a dedicated, explicit security surface.
- High-risk actions show amount, destination, organization and consequence before confirmation.
- No dark patterns, fake urgency or deceptive progress.
- Session expiry explains what happened and offers safe re-authentication.

## Responsive / field mode

Microfinance field workflows prioritize one-handed operation, sunlight readability, large touch targets, offline status, battery/network awareness and quick recovery after interrupted synchronization.

## Brand asset direction

Create these production assets from the same vector source:

- `tpay-mark.svg`
- `tpay-wordmark.svg`
- `tpay-lockup.svg`
- `tpay-icon-192.png`
- `tpay-icon-512.png`

The source vector is the single brand authority; do not create divergent logos per module.
