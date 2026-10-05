# DB-071 — T.Pay Governance Experience Layer

## Objective

Turn temporal permissions, reservations and linguistic consistency into first-class T.Pay Design primitives. These are cross-module governance UX rules and must not be reimplemented independently by Finance, People, Calendar, Microfinance, Education or other verticals.

## 1. Temporal Permission UX

A permission is displayed as a governed object:

Actor → Role → Scope → Resource → Action → Conditions → Time Window → Approval → Status → Expiration → Audit.

Supported states:
- Scheduled
- Active
- Expiring soon
- Expired
- Revoked
- Pending approval
- Emergency

The interface must show the exact timezone and effective window. Relative phrases such as “today” must be accompanied by an absolute date/time when the action is consequential.

### Temporal modes

1. Permanent access — explicitly justified.
2. Just-in-time access — activated only for a controlled task.
3. Scheduled access — future window.
4. Shift access — tied to an operational shift.
5. Delegated access — explicit delegator/delegate and scope.
6. Emergency access — break-glass, reason required, visible audit state.
7. Blackout — policy denies access despite a role normally allowing it.

### UX invariants

- Temporary access never silently becomes permanent.
- Expiration is visible before activation.
- Renewal is a new governed decision, not an invisible extension.
- A blocked action explains the governing condition and the valid escalation path.
- Emergency access is visually distinct without exposing unnecessary security detail.
- Access changes propagate through real-time status surfaces without screen-wide flashing.

## 2. Reservation Governance UX

Reservation object:

Resource + Owner + Purpose + Start + End + Buffer + Recurrence + Priority + Eligibility + Approval + Cancellation + No-show + Cost + Security Level + Audit.

Priority:
- P0 — Critical/emergency
- P1 — Operationally critical
- P2 — Normal business
- P3 — Convenience

Conflict resolution:
priority → policy → business impact → hard constraints → earliest valid alternative → human arbitration.

No silent overwrite.

The UI must provide:
- conflict preview;
- alternatives;
- impact summary;
- approval requirement;
- cancellation consequences;
- no-show state;
- buffer visibility;
- timezone clarity;
- audit trail.

## 3. Universal linguistic governance

French is the canonical default product language.

Terminology must distinguish:
- Organisation / Utilisateur / Membre / Employé / Agent / Client / Partenaire
- Identité / Compte / Profil / Membership
- Réservation / Engagement / Dépense / Paiement / Transaction / Facture / Commande
- IA / Assistant IA / Agent IA / Automatisation
- Temps réel / Quasi temps réel / Synchronisation différée

A terminology registry must define:
- canonical term;
- definition;
- allowed contextual variants;
- forbidden ambiguous synonyms;
- translations;
- country/sector notes;
- UI examples.

Labels use action verbs consistently:
Créer, Enregistrer, Envoyer, Valider, Approuver, Refuser, Annuler, Archiver, Restaurer, Exporter, Synchroniser.

Destructive actions must use explicit verbs rather than generic “OK”.

## 4. Localization architecture

Language packs are presentation resources only. They must never change domain identifiers, status enums, financial semantics or authorization rules.

Country packs may customize:
- currency formatting;
- date/time conventions;
- administrative terminology;
- education terminology;
- mobile-money provider display names;
- local-language templates;
- regulatory labels.

## 5. Real-time governance feedback

Every governed object supports:
- current state;
- last updated timestamp;
- source/context;
- pending synchronization;
- conflict;
- stale state.

When a permission or reservation changes:
1. update the authoritative state;
2. emit the domain event;
3. update affected clients;
4. show a localized diff;
5. preserve history.

## 6. Accessibility

Do not rely on color alone:
- status icon;
- text label;
- semantic ARIA state where applicable;
- focus management;
- keyboard operation;
- screen-reader explanation.

Emergency, blocked and expired states must remain understandable in high-contrast and reduced-motion modes.

## 7. Field mode

On low-end/mobile devices:
- render the critical state first;
- defer secondary history;
- show local vs authoritative state clearly;
- preserve pending actions locally where policy permits;
- never imply authoritative completion from local queueing.

## 8. Acceptance criteria

A governance component is accepted only when:
- desktop/mobile responsive;
- keyboard/screen-reader usable;
- timezone explicit;
- offline/reconnect behavior defined;
- real-time updates stable;
- conflicts testable;
- terminology canonical;
- audit state visible to authorized users;
- no silent overwrite;
- no hidden permanent privilege;
- no duplicate governance implementation.

This DB-071 layer is mandatory for future Calendar, People, Projects, Finance, Microfinance, Education, Transport and organization workflows.