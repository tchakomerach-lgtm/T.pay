# CT-042 — Protection du cycle de tontine communautaire

## Objectif
Proposer une couverture facultative destinée à préserver la continuité d'un cycle lorsqu'un membre abandonne effectivement ses engagements de cotisation. Le dispositif est administré dans T.Pay avec les institutions de microfinance partenaires et, pour toute véritable opération d'assurance, un assureur autorisé dans la zone CIMA.

## Frontière juridique non négociable
- T.Pay fournit le parcours numérique, le calcul de cotisation proposé, les contrôles, l'historique, les notifications et l'orchestration. T.Pay n'assume pas le risque assuré, ne promet pas l'indemnisation et ne conserve pas une prime dans un portefeuille interne.
- La microfinance partenaire distribue/assiste uniquement dans le cadre de ses habilitations et mandats applicables. Le rôle de partenaire ne vaut pas agrément d'assureur.
- L'assureur agréé porte le risque, émet/valide le contrat, fixe ou approuve la tarification technique, instruit le sinistre et décide de l'indemnisation.
- Avant activation commerciale au Togo : vérifier l'agrément de l'assureur, les habilitations/cartes professionnelles des distributeurs, les contrats de distribution, les règles de commission, les exigences de distribution numérique et le wording contractuel avec l'autorité compétente et un conseil spécialisé.
- Les articles 715 et 717 du Code CIMA réservent les opérations de microassurance aux entreprises agréées pour les branches concernées. L'article 731 encadre les personnes autorisées à présenter les produits et l'article 732 prévoit la carte professionnelle pour les personnes habilitées à administrer/présenter. L'article 704 permet certains contrats de microassurance de groupe pour une communauté clairement identifiée.
- Une réserve de solidarité ou garantie mutualisée sans assureur ne doit pas être présentée comme une assurance ni activée par défaut : sa qualification réglementaire doit être validée séparément.

## Gammes indicatives à soumettre à tarification
Les taux ci-dessous sont des hypothèses de travail produit, non des tarifs actuariels approuvés et non des offres vendables. L'assureur partenaire doit établir la tarification, les exclusions, la franchise, les plafonds et les conditions définitives.

| Gamme | Prélèvement indicatif par cotisation | Plafond indicatif | Délai de grâce indicatif |
|---|---:|---:|---:|
| Essentiel | 1 % de l'échéance | 1 échéance | 7 jours |
| Équilibre | 2 % de l'échéance | 2 échéances | 14 jours |
| Renforcé | 3 % de l'échéance | 3 échéances | 21 jours |

- Les trois niveaux sont facultatifs, comparables et affichent avant consentement le montant en XOF, le taux, le plafond, le délai d'attente, le délai de grâce, les exclusions et le coût total estimé du cycle.
- Exemple purement arithmétique : sur une échéance de 10 000 XOF, 1 % = 100 XOF, 2 % = 200 XOF, 3 % = 300 XOF. Cet exemple ne constitue pas une proposition commerciale approuvée.
- Le prélèvement est calculé sur chaque échéance réellement due, pas sur une somme inventée. Il n'est exécuté qu'après consentement explicite et création d'une instruction Financial Core.
- Pas d'adhésion pré-cochée, pas de couverture rétroactive, pas de modification du taux en cours de cycle sans nouveau consentement et avenant approuvé.
- Le contrat peut définir un plafond absolu par sinistre et par cycle inférieur au nombre d'échéances indiqué dans le tableau.

## Définition opérationnelle de l'abandon
L'absence d'un paiement isolé ne suffit pas à caractériser une désertion.
1. L'échéance devient impayée à sa date contractuelle.
2. Le délai de grâce de la gamme expire.
3. Au moins deux tentatives de contact traçables sont effectuées via des canaux distincts lorsque disponibles.
4. Deux revues indépendantes documentent l'absence de réponse et la situation du membre.
5. Les paiements en attente, incidents opérateur, maladie/force majeure, contestations, erreurs d'identité et suspicions de fraude sont examinés.
6. Le statut « abandon confirmé » est une conclusion documentée, contestable par le membre et non une décision automatique de l'algorithme.
7. Le dossier est transmis à l'assureur. Seul l'assureur décide de l'acceptation et du montant de l'indemnité selon le contrat.

## Flux financier
1. Présentation du devis et des exclusions.
2. Consentement explicite horodaté du membre.
3. Création d'une ligne de prime liée à l'échéance.
4. Encaissement par le rail autorisé, confirmation callback signé et comptabilisation atomique par Financial Core.
5. Seule une prime réglée et rapprochée peut satisfaire la condition de couverture de l'échéance.
6. En cas de sinistre : dossier, pièces, décision assureur, référence de règlement.
7. Toute indemnité est payée via Financial Core et affectée au cycle selon le contrat et la décision validée.
8. Reçu, notification et événement d'audit sont émis via outbox transactionnelle.

Un statut fournisseur « completed » n'est pas une preuve de règlement. Aucun écran ou repository de protection ne crée directement un mouvement Ledger. Les remboursements, annulations et reversals passent également par Financial Core.

## Contrôles de risque et de gouvernance
- Politiques versionnées et hashées ; proposition possible par T.Pay ou partenaire microfinance authentifié.
- Maker/checker obligatoire ; auteur et approbateur différents.
- Vérification explicite de l'agrément du partenaire assureur et du contrat signé avant activation ; les deux indicateurs sont obligatoires dans le domaine et en base.
- Adhésion liée au membre, groupe, organisation, gamme, version de police et échéances.
- Couverture active à la date d'échéance, période d'attente écoulée et prime de cette échéance réglée.
- Plafond par sinistre et par cycle ; aucun double remboursement de la même échéance.
- Contrôles anti-fraude, journal append-only, idempotence, replay et rapprochement.
- Isolation RLS par organisation et groupe ; Super Admin n'obtient aucun accès implicite aux données privées.
- Les membres non adhérents ne financent pas les sinistres des adhérents sans mécanisme collectif explicitement approuvé et juridiquement validé.
- Les contestations et recours sont accessibles au membre ; la médiation communautaire ne remplace pas la décision de l'assureur.

## Interfaces React / Flutter à construire
1. Catalogue des gammes : comparaison 3D légère, coût exact par échéance et couverture.
2. Consentement : contrat, exclusions, montant, durée, case non précochée, preuve d'acceptation.
3. Espace microfinance : portefeuille couvert, primes dues/réglées, anomalies, dossiers à instruire.
4. Console T.Pay : partenaires habilités, contrats, versions, plafonds, commissions autorisées, audit.
5. Espace membre : gamme active, échéances, reçus, statut de couverture, déclaration et suivi de sinistre.
6. Espace assureur : dossiers reçus, pièces, décision, plafond et référence d'indemnisation.
7. États loading/empty/error/offline, animations réduites sur demande, aucune donnée fictive.

## État de livraison CT-042
- Domaine TypeScript de calcul des primes, hash de politique, vérification du partenaire et calcul des délais d'attente/de grâce à partir des horodatages : ajouté dans cette branche.
- Migration PostgreSQL additive 138 : ajoutée ; à exécuter sur PostgreSQL réel et à tester sous rôle non-owner/non-BYPASSRLS.
- Tests unitaires de domaine : ajoutés ; exécution CI encore requise.
- API, repositories de persistance, endpoints, intégration Financial Core, outbox, interfaces React/Flutter, tests adversariaux et terrain : non livrés dans ce lot.
- Aucun assureur, contrat, taux actuariel, prime ou sinistre réel n'est déclaré actif.

## Références
- Code CIMA, art. 704 (microassurance de groupe) : https://cima-afrique.org/wp-content/code-cima/fr/Article704Assurancedegroupe-Micr.html
- Code CIMA, art. 715 (agrément) : https://cima-afrique.org/wp-content/code-cima/fr/Article715Agrementpourpratiquerd.html
- Code CIMA, art. 731 (personnes habilitées) : https://cima-afrique.org/wp-content/code-cima/fr/Article731Personneshabiliteespou.html
- Ministère des Finances du Togo, atelier sur la microassurance (6 mars 2023) : https://finances.gouv.tg/ouverture-dun-atelier-sur-la-micro-assurance/
