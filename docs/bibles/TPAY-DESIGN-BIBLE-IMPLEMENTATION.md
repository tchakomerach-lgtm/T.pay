# T.Pay Design Bible — Implementation Contract

Status: ACTIVE
Scope: Global Design/UX/Experience implementation contract
Version: 2026.10
Product: T.Pay

## 1. Purpose

This document converts the established T.Pay Design Bible into an implementation contract for the repository. It complements the Security Bible and never replaces security controls implemented in server/domain layers.

The UI must behave as one coherent operating system even when T.Pay exposes many verticals.

Core experience rule:

DATA -> STATE -> CAUSE -> IMPACT -> ACTION -> RESULT -> TRACE

The product must always make clear:
- where the user is;
- which personal/organization/team/project context is active;
- what changed;
- what the user can do;
- what is blocked;
- why it is blocked;
- what the next valid action is.

## 2. Design system tokens

### Brand
- Emerald: #0F8F68
- Mint: #35C99A
- Deep Graphite: #17212B
- Cloud: #F6F8FA
- Surface: #FFFFFF
- Line: #DDE3E8
- Success: #0F9D6E
- Warning: #D99A00
- Danger: #D64545
- Info: #2878D7
- AI: #7357C8
- Security: #3346A8
- Finance: #087F8C
- Critical Deep Red: #A52828

Token pipeline:
RAW COLOR -> GLOBAL TOKEN -> SEMANTIC TOKEN -> COMPONENT TOKEN

Color is never the only status signal. Every status also uses text/icon/state semantics.

Modes:
- light;
- dark;
- high contrast;
- low power;
- low-end device;
- reduced motion;
- field/offline.

## 3. Global visual language

Direction:
Fintech premium + social + enterprise.

Rules:
- controlled soft UI;
- restrained glass effects only where contrast remains strong;
- intelligent cards;
- dense but readable professional tables;
- clear data visualization;
- contextual actions;
- progressive disclosure;
- no decorative complexity that hides the primary action;
- thumb-friendly mobile controls;
- responsive layouts from low-end phone to desktop;
- stable layouts during real-time updates.

The first screen must be understandable in approximately three seconds:
1. context;
2. current state;
3. primary action;
4. important exception.

## 4. T.Pay Experience OS

Global shell:
- Home/activity;
- Organisations;
- Social;
- Opportunité;
- Tontine communautaire;
- Wallet;
- notifications;
- universal search;
- command/action center;
- profile/settings.

The shell is context-aware. Personal, organization, team, project and operational contexts must not be confused.

Every major entity has a universal object presentation:
- identity;
- status;
- owner;
- context;
- key metrics;
- available actions;
- relationships;
- history;
- documents;
- events;
- audit/trust information where authorized.

## 5. Universal action experience

All consequential actions follow:

intent
-> context
-> object
-> authorization
-> preconditions
-> preview
-> confirmation
-> execution
-> result
-> trace

Required states:
default, hover, focus, pressed, loading, success, warning, error, disabled, offline, syncing, conflict, permission-denied.

Actions must support:
- contextual actions;
- bulk actions;
- chained actions;
- receipts;
- history;
- partial success;
- recovery;
- clear explanations;
- impact preview;
- "Pourquoi ?";
- "Qu'est-ce qui a changé ?".

Financial and high-impact actions must never appear to succeed before the authoritative domain result exists.

## 6. Workflow experience

Workflow views:
- compact;
- standard;
- detailed;
- board/timeline when appropriate.

Workflow capabilities:
- states;
- blockers;
- ownership;
- handoff;
- SLA;
- dependencies;
- conditional branches;
- parallel branches;
- exception paths;
- human intervention;
- AI-assisted preparation;
- simulation;
- versioning;
- analytics;
- bottleneck detection.

No-code workflow builders must produce auditable, versioned definitions.

## 7. Real-time experience

Real-time UI is event-driven, not screen-refresh driven.

Rules:
- diff-only updates;
- coalescing;
- batching;
- deduplication;
- debouncing;
- priority-aware delivery;
- no whole-screen blinking;
- changed-row/card highlighting;
- "Mis à jour" freshness indication;
- reconnecting state;
- stale-data state;
- conflict state;
- offline queue state.

Live surfaces:
- activity feed;
- command center;
- maps;
- operational dashboards;
- presence;
- financial pulse;
- workflow pulse;
- transport/field operations.

Add a "catch-up" mode so users can safely review missed events after reconnection.

## 8. Organization OS

Organization creation prepares:
- public page;
- website;
- internal social network;
- workspace;
- ERP/CRM;
- documents;
- wallet;
- specialist AI assistant;
- marketplace;
- recruitment/opportunities;
- communication center;
- dashboards.

Supported organization categories include education, microfinance, enterprise, commerce, hospitality, health, agriculture, NGO/association, public administration, transport, real estate, industry, media, sport, culture, startup, PME/PMI and custom types.

Logo/identity:
- generate or associate a logo at organization creation;
- propagate it through organization UI;
- use it automatically in generated documents;
- support configurable school bulletin/relevé templates;
- version document templates instead of hard-coding one national layout.

## 9. People & Teams UX

Separate:
Identity != Account != Profile != Membership != Role != Position != Person.

People experience must support:
- organization membership;
- multiple roles;
- teams;
- skills;
- evidence and skill expiry;
- capacity;
- workload;
- availability;
- succession;
- onboarding/offboarding;
- knowledge continuity;
- crisis teams;
- role-aware UI.

Never expose sensitive presence or personnel information outside its authorization context.

## 10. Projects & Tasks UX

Project workspace:
- portfolio;
- project;
- phase;
- milestone;
- task;
- dependency;
- resource;
- budget;
- risk;
- decision;
- document.

Provide:
- predictive delay indicators;
- workload/capacity view;
- dependency graph;
- what-if simulation;
- project health;
- field/offline mode;
- AI project assistant;
- real-time collaboration.

Predictions must be explicitly labeled as estimates.

## 11. Calendar & Meetings

T.Pay Time OS:
- personal;
- team;
- organization;
- project;
- portfolio;
- resource;
- field/shift;
- on-call.

Meeting UX:
- preparation brief;
- participants;
- agenda;
- live meeting mode;
- controlled transcription;
- AI notes;
- decisions;
- tasks;
- risks;
- follow-up;
- meeting memory.

Resource booking must use reservation governance and conflict rules.

## 12. Temporal permission governance

Permission object:

Permission + Scope + Actor + Role + Resource + Action + Start + End + Timezone + Recurrence + Conditions + Approval + Emergency Override + Expiration + Renewal + Audit.

Support:
- permanent;
- temporary;
- scheduled;
- shift-based;
- delegated;
- emergency/break-glass;
- automatic expiry;
- renewal;
- approval chain;
- blackout periods.

UI must distinguish:
ACTIVE / SCHEDULED / EXPIRED / REVOKED / PENDING APPROVAL / EMERGENCY.

No temporary privilege becomes permanent by accident.

## 13. Reservation governance

Reservation fields:
resource, owner, purpose, start, end, buffer, recurrence, priority, eligibility, cancellation policy, no-show policy, conflict policy, approval, cost, security level, audit.

Priority:
- P0 Critical/emergency;
- P1 Operationally critical;
- P2 Normal business;
- P3 Convenience.

Conflict engine:
priority
-> policy
-> business impact
-> hard constraints
-> earliest valid alternative
-> human arbitration.

Never silently overwrite an existing reservation.

## 14. Finance & Budget OS UX

Finance UI must distinguish:
- real balance;
- expected revenue;
- actual expense;
- commitments;
- forecast;
- truly mobilizable availability.

Views:
- financial control tower;
- budget hierarchy;
- commitments/pre-commitments;
- cost centers;
- forecasts;
- scenarios;
- stress tests;
- anomalies;
- spend intelligence;
- financial dependency graph;
- action queue.

Forecast scenarios:
conservative / central / optimistic / stress.

An anomaly is not automatically fraud. UI must use neutral analytical language.

Financial drilldown:
KPI -> category -> object -> document -> event -> audit.

The financial UI must remain separate from the underlying ledger/payment/credit/commission/subsidy engines.

## 15. Motion Design System

Motion purposes:
- orientation;
- comprehension;
- confirmation;
- continuity.

Timing:
- instant: 0–80ms;
- micro: 100–160ms;
- standard: 180–260ms;
- emphasis: 260–360ms;
- complex: 360–500ms.

Patterns:
- enter: ease-out;
- exit: ease-in;
- transformation: ease-in-out;
- local field error, never whole-screen shaking;
- subtle success;
- skeleton loading;
- drawer 180–240ms;
- real-time diff highlight;
- table changed-row highlight;
- financial number interpolation;
- drill-down continuity;
- relation-line reveal;
- universal object transitions.

Reduce-motion must remove non-essential movement without removing state information.

## 16. Field and low-connectivity mode

T.Pay must remain usable with:
- weak networks;
- intermittent connectivity;
- low battery;
- low-memory devices;
- small screens.

Field mode:
- large touch targets;
- minimal payload;
- offline queue;
- visible sync status;
- local draft protection;
- conflict resolution;
- priority data first;
- compressed media;
- delayed non-critical refresh;
- explicit last-synced timestamp.

For field financial operations, local confirmation must never be presented as final settlement when authoritative settlement has not occurred.

## 17. AI experience

T.Pay AI Core is a control plane, not a chat widget.

AI UI must show:
- active context;
- source/objects used when appropriate;
- confidence or uncertainty where meaningful;
- proposed action;
- required permissions;
- approval state;
- execution state;
- final result;
- trace.

Specialists can cover finance, education, microfinance, commercial growth, people, projects, calendar, documents, health, agriculture and transport.

AI must not silently:
- mutate financial state;
- bypass authorization;
- contact people without permitted consent/channel policy;
- change contracts/prices without required approval;
- expose data outside tenant/context boundaries.

## 18. Accessibility and language

French is the default product language.

Terminology registry:
- Organisation;
- Utilisateur;
- Membre;
- Employé;
- Agent;
- Client;
- Partenaire;
- Compte;
- Profil;
- Identité;
- Membership;
- Réservation;
- Engagement;
- Dépense;
- Paiement;
- Transaction;
- Facture;
- Commande;
- IA;
- Assistant IA;
- Agent IA;
- Automatisation;
- Temps réel;
- Quasi temps réel;
- Synchronisation différée.

Do not interchange these concepts.

Accessibility:
- keyboard navigation;
- visible focus;
- screen-reader labels;
- adequate contrast;
- semantic headings;
- touch targets;
- status text + icon;
- reduced motion.

Localization must support country-specific terminology without changing the underlying domain model.

## 19. Component architecture

Shared components should be organized by semantic responsibility:
- Shell;
- Navigation;
- ContextSwitcher;
- UniversalSearch;
- CommandCenter;
- ObjectHeader;
- StatusBadge;
- MetricCard;
- DataTable;
- Timeline;
- ActivityFeed;
- Workflow;
- Calendar;
- ResourceReservation;
- Approval;
- FinancialSummary;
- NotificationCenter;
- AIActionCard;
- OfflineIndicator;
- SyncStatus;
- ConflictResolver;
- AuditSummary.

Components must be composable and domain-agnostic wherever possible.

## 20. Performance contract

Required:
- route-level code splitting;
- lazy loading;
- list virtualization where justified;
- image optimization;
- cache strategy;
- request deduplication;
- optimistic UI only for operations whose semantics permit it;
- server-authoritative reconciliation;
- telemetry for slow interactions;
- low-end rendering tier.

Do not optimize by hiding important state.

## 21. Testing contract

Every new UI/experience brick should cover as appropriate:
- unit tests;
- accessibility tests;
- component tests;
- integration tests;
- responsive tests;
- offline/reconnect tests;
- permission-state tests;
- conflict tests;
- real-time update tests;
- visual regression tests for stable critical surfaces.

Definition of Done:
DESIGN -> IMPLEMENT -> TEST -> ACCESSIBILITY -> RESPONSIVE -> OFFLINE/REALTIME -> SECURITY REVIEW -> OBSERVE -> COST REVIEW -> CI.

## 22. Togo/Africa readiness

The design must support:
- low-bandwidth operation;
- intermittent connectivity;
- mobile-first usage;
- field agents;
- local-language content packs;
- SMS/USSD-compatible fallback flows where applicable;
- mobile-money workflows through contract-bound provider adapters;
- simple receipt/e-carnet presentation;
- explicit reconciliation states.

Never invent provider wire formats. Production integrations remain contract-bound and fail closed until authoritative operator/aggregator contracts are available.

## 23. Implementation priority

Phase A — foundation:
1. token registry;
2. typography/spacing;
3. shell;
4. context switcher;
5. universal states;
6. navigation;
7. notification center;
8. universal object/action primitives.

Phase B — operational UX:
9. workflow;
10. real-time event surface;
11. offline/sync states;
12. command center;
13. calendar/reservations;
14. people/teams;
15. projects/tasks.

Phase C — financial UX:
16. finance control tower;
17. budget;
18. commitments;
19. forecast;
20. scenario simulation;
21. financial drilldown.

Phase D — vertical UX:
22. microfinance;
23. education;
24. tontine;
25. marketplace;
26. opportunity;
27. social;
28. transport;
29. health;
30. agriculture.

Phase E — AI UX:
31. AI Core surface;
32. specialist agent cards;
33. approval/preview UI;
34. AI trace/explainability;
35. agent collaboration.

## 24. Engineering rule

Do not create parallel design systems.

Any new component must first search for an existing semantic component/token.

Any new interaction must first check:
- global action grammar;
- state grammar;
- motion grammar;
- terminology registry;
- accessibility rules;
- offline/realtime semantics.

When a new requirement conflicts with an existing Bible rule, create an explicit decision record rather than silently overriding the rule.

## 25. Field acceptance checklist

A design brick is accepted only if:
- usable on a small Android screen;
- understandable without technical knowledge;
- primary action is obvious;
- dangerous action is distinguishable;
- offline state is explicit;
- synchronization state is explicit;
- permission denial explains the next valid path;
- real-time updates do not destabilize the interface;
- accessibility state remains meaningful without color;
- terminology is consistent;
- existing domain invariants remain untouched;
- tests and CI pass.

## 26. Next construction gate

After this contract is recorded, the implementation sequence is:
1. audit current frontend structure;
2. identify existing reusable components;
3. introduce versioned design tokens;
4. establish shared shell/context primitives;
5. implement universal state grammar;
6. integrate real-time/offline indicators;
7. progressively migrate existing screens;
8. add visual regression/accessibility coverage;
9. measure performance on low-end/mobile profiles;
10. continue into the next Design Bible brick without declaring T.Pay complete prematurely.

T.Pay is not considered complete until the required domain layers, operational controls, UX states, tests, observability and field-readiness gates are actually implemented.
