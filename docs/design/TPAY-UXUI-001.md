# T.Pay OS — UX/UI-001

## Design direction
Modern, professional, mobile-first, calm and configurable. Existing repository design tokens and semantic components remain the sole design-system source of truth. This document defines usage contracts, not a competing design system or fabricated visual baseline.

## Responsive layout
Mobile uses compact top bar, single-column content and appropriate bottom navigation; tablet adapts to two columns only when readable; desktop uses persistent navigation and constrained content width. Respect safe areas and keyboard overlays. Prevent horizontal overflow at 320 CSS px. Primary actions must not obscure content or keyboard focus.

## Information hierarchy
Primary navigation: Accueil, Organisations, Réseau social, Opportunité, Tontine communautaire. Wallet/Finances appears only when enabled and authorized. Organization workspace must be clearly scoped and distinct from global navigation. Admin/security controls require explicit context labels.

## Semantic visual tokens
Use existing semantic tokens for surfaces, text, borders, primary actions, success, warning, danger, focus and disabled states. Meaning cannot depend on color alone. Meet WCAG 2.2 AA contrast. Use existing type and spacing scales rather than arbitrary values.

## Component contracts
- Buttons: primary/secondary/tertiary/destructive; loading prevents duplicate submissions.
- Form fields: persistent label, hint and programmatically associated validation message.
- Cards: nested actions remain keyboard accessible.
- Status indicators: controlled vocabulary and text label, not color-only.
- Dialogs/sheets: focus trap, initial focus, close policy and focus return.
- Toasts: short feedback only; critical errors stay visible in page content.
- Pagination: preserve filters and scroll intent; cursor-based controls and server-enforced maximum.
- Tables: responsive small-screen alternative and permission-gated sensitive columns.
- Money: locale-aware currency, with available/held/pending states distinguished.
- AI action preview: separate recommendation from execution; show target, consequence and approval requirement.

## Required states for every async screen
Initial loading; loaded; empty; recoverable error; permission denied/not found; offline/stale with last update; mutation pending; confirmed success only after server acknowledgment; unknown provider outcome; destructive confirmation where applicable.

## Motion/performance
Motion communicates hierarchy or state, never blocks tasks. Honor reduced-motion preference. Avoid layout shift, reserve media dimensions and lazy-load below-fold content. Keep low-bandwidth paths usable without autoplay.

## Accessibility
WCAG 2.2 AA baseline; semantic landmarks and heading order; keyboard and visible focus; announced labels/errors; adequate touch targets; focus not obscured; contrast, zoom/reflow and reduced-motion tests. French baseline must avoid unexplained abbreviations.

## Content language
Distinguish demande créée, paiement en attente, paiement confirmé, comptabilisé and réconcilié. Error copy explains what happened, whether data was saved and the safe next step. Never ask users to repeat a financial command with unknown outcome. Demo content carries a persistent “DÉMONSTRATION — aucune opération réelle” label.

## Visual QA
Run desktop/tablet/mobile viewport matrix, deterministic screenshots, overflow and geometry assertions, focus/live-region tests and low-end Android profiling. Do not claim pixel-perfect regression until approved golden baselines are reviewed.