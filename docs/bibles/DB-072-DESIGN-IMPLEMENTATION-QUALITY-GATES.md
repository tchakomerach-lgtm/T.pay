# DB-072 — T.Pay Design Implementation Quality Gates

## Purpose

Prevent the Design Bible from becoming documentation-only. Every visual/interaction brick must prove implementation quality before being considered complete.

## Gate A — Repository discovery

Before coding:
- inspect existing components;
- inspect tokens;
- inspect routes/screens;
- inspect domain contracts;
- inspect current tests;
- search for equivalent behavior;
- identify affected Bibles.

Failure condition: duplicated component or conflicting design rule.

## Gate B — Design contract

Each brick declares:
- user context;
- role;
- object;
- primary action;
- secondary actions;
- states;
- error paths;
- offline behavior;
- real-time behavior;
- accessibility behavior;
- permission behavior;
- performance target.

## Gate C — Implementation

Use shared tokens/components. Avoid hard-coded colors, spacing, motion durations and arbitrary status labels.

Required semantic state coverage where applicable:
default / hover / focus / pressed / loading / success / warning / error / disabled / offline / syncing / conflict / stale / permission denied.

## Gate D — Functional verification

Test:
- normal path;
- invalid input;
- duplicate action;
- retry;
- cancellation;
- partial success;
- permission denial;
- expired permission;
- stale data;
- reconnect;
- conflict;
- low-bandwidth;
- low-memory;
- reduced-motion.

## Gate E — Real-time verification

Verify:
- duplicate events;
- out-of-order events;
- rapid updates;
- reconnect catch-up;
- stale snapshot;
- conflict resolution;
- event coalescing;
- changed-item highlighting;
- no full-screen flashing.

## Gate F — Accessibility

Verify:
- keyboard navigation;
- focus visibility;
- semantic labels;
- screen-reader state;
- contrast;
- non-color status;
- touch target size;
- reduced motion;
- zoom/reflow;
- error announcement.

## Gate G — Security UX

Verify:
- unauthorized action cannot appear executable as if authorized;
- permission changes are reflected;
- sensitive values are minimized;
- critical actions have explicit confirmation;
- authorization source is server authoritative;
- audit/trust information is not spoofable by presentation state.

Security implementation remains governed by the Security Bible.

## Gate H — Performance

Define budgets appropriate to the surface:
- initial shell responsiveness;
- interaction latency;
- list rendering;
- real-time update cost;
- memory;
- battery;
- network payload.

Low-end mode must reduce visual/animation overhead without removing critical state.

## Gate I — Visual regression

Critical surfaces require:
- component snapshots;
- responsive viewport checks;
- dark/high-contrast checks;
- reduced-motion checks;
- stable semantic status assertions.

Avoid snapshot-only validation; combine visual and behavioral assertions.

## Gate J — Documentation

Record:
- implementation path;
- reused components;
- new tokens;
- changed terminology;
- test evidence;
- known limitations;
- rollback/migration needs;
- related Bible/ADR references.

## Gate K — Completion

A design brick is complete only when:

DESIGN
→ IMPLEMENT
→ UNIT/COMPONENT TEST
→ INTEGRATION TEST
→ A11Y
→ RESPONSIVE
→ REALTIME/OFFLINE
→ SECURITY REVIEW
→ PERFORMANCE/COST
→ CI
→ RECORD

No “complete” label before the entire applicable chain passes.

## Anti-regression principle

A later Design Bible section must improve or extend the system without silently weakening earlier requirements.

When a conflict exists:
1. identify the conflicting rule;
2. record the decision;
3. update the source Bible/ADR;
4. update tests;
5. implement;
6. verify downstream surfaces.

## Field acceptance

Test at minimum:
- small Android viewport;
- unstable network;
- reconnect;
- low battery mode;
- reduced motion;
- French UI;
- role with limited permissions;
- role with temporary permission;
- organization context switching;
- large data list;
- real-time event burst.

T.Pay is not Design-Bible complete until these quality gates are applied across all required surfaces.