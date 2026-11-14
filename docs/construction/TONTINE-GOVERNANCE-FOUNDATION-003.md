# Tontine communautaire — Gouvernance versionnée (003)

## Livré dans cette tranche

- Le modèle de vote reconnaît explicitement `approve`, `reject` et `abstain`.
- Les règles valident des pourcentages entiers bornés et le booléen d'abstention.
- Le calcul du quorum utilise le nombre de bulletins déposés; une abstention peut donc participer au quorum si la politique l'autorise.
- Les votes multiples d'un même membre et les bulletins attachés à une autre proposition sont rejetés par le moteur de domaine.
- Les fenêtres de proposition ont des contrôles de dates et d'état.
- La migration 117 introduit une politique de groupe versionnée et des colonnes de photographie des règles et de l'effectif éligible au moment de l'ouverture.

## Contrat de données

La politique doit être configurée explicitement pour chaque groupe en mode `member_vote`. Aucun quorum ni seuil d'approbation par défaut n'est inventé. Les propositions conservent les valeurs applicables à leur ouverture afin qu'une modification ultérieure de politique ne réécrive pas le résultat historique.

## Garde-fous

- Une seule voix par membre et proposition, garantie par la contrainte unique déjà présente et les contrôles du domaine.
- Les opérations d'écriture doivent être exécutées sous contexte tenant/organisation, dans une transaction PostgreSQL.
- L'ouverture, le vote et la clôture doivent écrire audit et Outbox dans la même transaction que la mutation.
- Les décisions approuvées ne déplacent jamais directement de fonds. Toute contribution, compensation ou distribution passe par le Financial Core.
- L'absence de politique explicite bloque l'ouverture d'un vote; il ne faut pas substituer une valeur arbitraire.

## Reste avant activation fonctionnelle

La tranche ajoute les fondations du domaine et du schéma. Les routes HTTP de configuration de politique, création de proposition, vote et finalisation transactionnelle, ainsi que leur UI d'action Web/Flutter et leurs tests PostgreSQL concurrents, doivent encore être raccordées avant d'activer la gouvernance de bout en bout.
