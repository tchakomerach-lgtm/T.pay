# T.Pay — Assurance générale et individuelle, clôture et reversement

## Décision d'architecture
Deux produits distincts, un seul moteur de risque et un seul Financial Core.
- GENERAL_CYCLE : continuité du cycle si un bénéficiaire ayant déjà reçu le pot ou un cotisant abandonne ses obligations.
- INDIVIDUAL_CONTRIBUTION : option choisie par un membre, supplément de prime sur chaque échéance réellement due et couverture plafonnée de ses propres cotisations.

La couverture générale ne doit jamais promettre que tous seront remboursés sans capital, réassurance, réserves, contrat et plafonds démontrés. Le risque est porté par un assureur agréé ou un mécanisme mutualiste dont la qualification et l'autorisation sont confirmées. Une microfinance n'est pas automatiquement assureur. T.Pay orchestre, contrôle et audite ; Financial Core seul exécute les mouvements.

## A. Assurance générale — continuité du cycle
Risques possibles, uniquement si explicitement couverts au contrat :
- bénéficiaire qui reçoit le pot puis cesse de cotiser ;
- cotisant qui cesse ses versements après délai de grâce ;
- décès, incapacité ou force majeure selon exclusions et garanties contractuelles.

### Mesures robustes
1. Garantie/caution de performance du bénéficiaire avant versement du pot, seulement si autorisée et proportionnée.
2. Réserve de continuité préfinancée et cantonnée auprès d'un établissement autorisé, dimensionnée par scénarios de défaut, jamais mutualisée entre cycles sans base juridique.
3. Versement progressif ou plafond prudent pour les nouveaux profils, avec règles transparentes et non discriminatoires.
4. Ordre de rotation tenant compte des obligations restantes sans score opaque ; dette de contribution du bénéficiaire documentée après perception.
5. Alertes avant échéance, délai de grâce, contact traçable et régularisation.
6. Deux revues indépendantes, contrôle des incidents opérateur et paiements en transit, contestation du membre et examen anti-fraude.
7. Décision et indemnisation par l'assureur. Les recouvrements postérieurs sont répartis suivant la subrogation et le contrat ; jamais de double indemnisation.

### Waterfall en cas de défaut
1. Suspendre les prochains décaissements non irrévocablement exécutés.
2. Réconcilier les paiements entrants en transit et rejouer les callbacks idempotents.
3. Mobiliser seulement une réserve disponible et juridiquement utilisable.
4. Appliquer le délai de grâce, les contacts et une revue contradictoire.
5. Déclencher une garantie/caution seulement si le contrat le prévoit.
6. Transmettre le dossier à l'assureur ; payer après décision et règlement confirmés.
7. Recouvrement amiable/légal autorisé et affectation selon le contrat.

## B. Assurance individuelle
- Le membre choisit explicitement aucune couverture ou une gamme optionnelle.
- Prime par échéance : arrondi supérieur de (contribution réelle × taux en points de base / 10 000).
- Le devis montre montant XOF, taux, plafond, franchise, délai d'attente, exclusions, durée et coût total estimé.
- Consentement distinct, horodaté et révocable pour les échéances futures ; aucune adhésion précochée ni couverture rétroactive.
- Une prime est liée à une échéance et à un Payment Intent idempotent. La couverture ne commence qu'après confirmation Financial Core et période d'attente.
- En cas de sinistre couvert, l'assureur peut payer l'échéance ou le membre selon le contrat, dans la limite de la couverture.
- Une prime acquise n'est pas automatiquement remboursable parce qu'aucun sinistre n'a eu lieu ; une ristourne nécessite une clause et une validation actuarielle.

## C. Clôture sans incident et reversement automatique
Le reversement automatique vise uniquement les sommes remboursables : avance de garantie, réserve restituable, trop-perçu ou caution libérable. Il ne transforme pas une prime d'assurance acquise en épargne remboursable.

### Conditions bloquantes
- cycle terminé et paiements entrants/sortants rapprochés ;
- aucun incident, sinistre, litige, callback en attente, reversal ni dette non soldée ;
- réserves suffisantes et fonds disponibles ;
- période contractuelle de contestation échue ;
- validation maker/checker et snapshot signé/hashé.

### Calcul individuel
net = max(0, brut_remboursable - commission_TPay - commission_microfinance - autres_déductions_autorisées).

Les commissions sont déduites uniquement si elles sont dues, versionnées, approuvées et autorisées par le mandat. Pas de commission sur l'épargne principale ni sur les primes d'assurance sauf clause légalement validée.

### Exécution
1. Construire un snapshot immuable par cycle et une allocation par membre.
2. Vérifier que la somme des allocations égale le total du snapshot.
3. Financial Core crée un batch idempotent, réserve les fonds et effectue les paiements.
4. Chaque paiement porte une référence Financial Core unique ; un callback signé confirme le statut.
5. Timeout : état pending, rapprochement puis reprise avec la même clé d'idempotence.
6. Échec : état failed et traitement contrôlé ; jamais de second paiement.
7. Incident partiel : geler uniquement la part contestée si le contrat et la loi le permettent, pas les parts incontestées.

Interdictions : pas de déduction sans mandat, pas de commission sur prime acquise sans base contractuelle, pas de reversement non rapproché, pas de compensation entre organisations ou cycles.

## D. Séparation stricte des poches
- cotisation principale / pot ;
- prime d'assurance générale ;
- prime individuelle ;
- réserve ou caution remboursable ;
- commission T.Pay ;
- commission microfinance ;
- indemnité assureur ;
- recouvrement/subrogation ;
- remboursement final.

Montants en unités mineures entières XOF. Les arrondis, taux et versions sont conservés dans le snapshot. Financial Core reste seul à écrire au Ledger et à exécuter Payment Intents, refunds, reversals et batches.

## E. Permissions
- Membre : devis, consentement, échéances, couverture, sinistre, contestation, reçus.
- Gestionnaire : suivi de cycle et incidents, pas d'auto-approbation.
- Microfinance : tâches explicitement mandatées, portefeuille et commissions autorisées.
- Assureur : police, tarification, décision sinistre, indemnité.
- T.Pay : orchestration, audit, notifications, règles et idempotence.
- Super Admin : gouvernance plateforme, sans accès implicite aux dossiers privés.

Maker/checker, MFA/step-up, RLS organisation/groupe, journal append-only, anti-replay, preuves de consentement et séparation des fonctions.

## F. Interfaces React et Flutter
### Espace membre
Comparateur animé des deux protections, coût par tour en XOF, consentement explicite, timeline de couverture, prime réglée/en attente, sinistre, contestation et détail du reversement brut/commissions/net.

### Espace groupe
Exposition du cycle, réserve disponible, bénéficiaires, échéances, alertes, incidents, revue et statut assureur.

### Espace microfinance
Portefeuille de groupes, primes, commissions autorisées, recouvrements et rapprochement, sans accès inter-tenant.

### Espace assureur
Contrats, versions, dossiers, pièces, décisions, plafonds et références de règlement.

### Motion design
3D légère et transitions courtes ; aucune animation ne bloque une action financière. Respect de prefers-reduced-motion sur Web et MediaQuery Flutter. États loading/empty/error/offline/retry, clavier, contraste et lecteur d'écran. Données réelles uniquement dans les environnements réels.

## G. Migration 139
La migration ajoute les produits GENERAL_CYCLE et INDIVIDUAL_CONTRIBUTION, les adhésions individuelles, les primes par échéance, les snapshots de clôture, les allocations de remboursement et les événements append-only. RLS est forcée sur les nouvelles tables. Aucun mouvement Ledger n'est effectué par cette migration.

## H. Nettoyage GitHub sans perte
Supprimables après preuve de non-référence : dist, build, .dart_tool, caches, coverage, APK de compilation temporaires, archives ZIP redondantes et exports reproductibles.
À conserver : Bibles, prompts, migrations, tests, contrats API, lockfiles, preuves CI/terrain, rapports d'audit, documents juridiques, assets de marque référencés.
Supprimer un fichier dans un nouveau commit ne réduit pas la taille de l'historique Git. Les gros objets historiques demandent git-sizer, analyse des blobs, sauvegarde et décision distincte de réécriture. Aucun nettoyage destructif n'est effectué sans inventaire vérifié.

## I. Gates avant activation
1. TypeScript et tests unitaires.
2. Migration 139 sur PostgreSQL 17 propre et base upgrade.
3. Tests concurrence, RLS non-owner/non-BYPASSRLS, cross-tenant, replay, idempotence, double paiement, calculs, arrondis et rollback.
4. API authentifiée, permissions, audit/outbox.
5. React et Flutter via DB-074, tests widget/e2e.
6. Parcours Android terrain et reprise réseau.
7. Validation juridique/actuarielle, contrats assureur/microfinance et tests sandbox opérateur.
8. Aucun merge avant PostgreSQL, Android et Flutter verts sur le même SHA et preuves terrain.

## État réel
La migration 139 et cette spécification sont enregistrées sur la branche d'intégration. Elles ne prouvent pas encore que l'API, les parcours de paiement, le reversement Financial Core ou les interfaces sont terminés. Les taux restent non commercialisables avant validation actuarielle et juridique. TMoney/Flooz restent désactivés sans contrats d'intégration et justificatifs techniques.
