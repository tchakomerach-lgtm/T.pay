# Microfinance — Gestion financière des Tontines communautaires — 24 séquences

Ce contrôle de construction couvre exclusivement l’interface financière entre une microfinance partenaire et une Tontine communautaire indépendante. Il ne transfère ni gouvernance communautaire ni autorité du Financial Core.

| # | Séquence | Gate de validation |
|---:|---|---|
| 01 | Portefeuille partenaire | groupe, MF, devise et statut correctement scopés |
| 02 | Autorisation RBAC/ABAC | rôle actif, expiration et capacité vérifiés à chaque opération |
| 03 | Isolation multi-MF | une MF ne lit/modifie jamais les données d’une autre |
| 04 | Vue membre financière | identité, service, contribution et payout séparés |
| 05 | KYC/attestation | vérification avant opération sensible |
| 06 | Destination de payout | destination liée au bénéficiaire et à la MF |
| 07 | Collecte | intention, paiement confirmé et écritures distincts |
| 08 | Offline field | opérations signées, séquencées, expirantes, sans mutation Ledger offline |
| 09 | Idempotence | doublons détectés sans double comptabilisation |
| 10 | Préparation payout | maker prépare, jamais d’approbation implicite |
| 11 | Approbation payout | checker distinct du préparateur |
| 12 | Limites | montant, fréquence, exposition et risque bornés |
| 13 | Provider routing | adaptateur fournisseur isolé et état pending explicite |
| 14 | Callback sécurisé | signature, fraîcheur, replay et payload binding |
| 15 | Settlement | Financial Core seul autorise le posting Ledger |
| 16 | Réconciliation | écart => case, aucune correction silencieuse |
| 17 | Incidents | hold ciblé, preuves et chaîne de conservation |
| 18 | Remboursement/reversal | workflow Financial Core, jamais UPDATE du Ledger historique |
| 19 | Audit | événements immuables et actor/action/scope/correlation |
| 20 | Notifications | statut réel uniquement, anti-duplication |
| 21 | Concurrence | verrouillage DB et versioning contre races |
| 22 | Résilience | provider/db/network dégradés sans faux succès |
| 23 | Observabilité | SLA, exceptions, exposition et qualité de données |
| 24 | Release gate | migrations + unit + PostgreSQL + sécurité + séparation de domaine verts |

## Invariants

- La Tontine communautaire reste indépendante de la tontine journalière de microfinance.
- La microfinance fournit un service financier; elle ne devient pas propriétaire des règles de rotation, votes ou constitution.
- Le Financial Core est l’unique autorité de Ledger.
- provider_pending n’est jamais settled.
- Un mismatch attendu/observé ouvre une réconciliation.
- Les commissions sont celles du snapshot applicable; aucun taux n’est codé en dur.
- Aucun minimum universel de contribution n’est codé en dur.
- Une opération critique reste fail-closed en cas d’incertitude.

## État de validation

Les 24 séquences sont traitées comme gates de release; une séquence est validée uniquement lorsque son invariant est couvert par le code, un test et le CI courant. Ce document ne transforme pas une séquence non implémentée en séquence validée.


## Additional hardening — current construction branch

- The partner payout preparation and approval queries revalidate the canonical payout intent against the exact organization, cycle, eligible beneficiary slot, active membership, selected partner microfinance, amount, currency, destination, KYC flag, human-approval flag, and current `approved` state.
- Settlement audit records use an explicit `last_actor_id`; missing actor attribution fails closed. Audit update/delete/truncate are blocked at the database boundary, and public mutation privileges are revoked.
- Settlement instructions enforce immutable payout bindings, maker/checker separation, optimistic version increments, and monotonic state transitions.
- Tontine migrations have been allocated unique numeric versions `100–113`. This avoids collisions with the current main-branch migration versions `044–099`; `tests/tontine-migration-sequence.test.ts` guards against duplicate prefixes.
- A live PostgreSQL test covers partner scope mismatch, immutable replay, source payout state revalidation, maker/checker, audit actor attribution, immutable payout binding, transition rollback rejection, and append-only audit behavior.

## Execution status

The latest GitHub Actions attempt still fails before runner assignment (`runner_id=0`, no steps, no logs). Therefore no code test result has been produced by CI. The feature branch also diverges from current `main`; before any production merge, synchronize/reconcile the branch with current main and run the full suite against the resulting exact SHA. These facts are release blockers, not passing gates.
