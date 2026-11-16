# CI principal — diagnostic et correction du 12 novembre 2026

## Exécution observée

- Workflow : `T.Pay CI` (`.github/workflows/ci.yml`)
- Run : `43294492309`
- Commit PR : `a6c9f147ab0b3cc3d900f653ff35202b74e654ad`
- Événement : `pull_request`
- Résultat : `failure`
- Job : `quality`
- Étape bloquante : `npm run typecheck`

## Cause racine

Le fichier `apps/experience-web/src/app.tsx` contenait une fermeture de fragment JSX supplémentaire à la fin de `TpayApp`. TypeScript signalait TS1003, TS17002, TS1005 et TS1109. L'étape s'arrêtait avant le build, les tests unitaires, PostgreSQL live, Security Fortress et les builds Web.

PostgreSQL 17 avait démarré et était healthy. Le test PostgreSQL n'a pas été exécuté : il a été ignoré par l'arrêt anticipé du job, et non validé.

## Correction

Le commit `8ff7456bffc7d16ae27e463c23c81db6be3351d5` retire la fermeture JSX excédentaire. Cette correction syntaxique doit être suivie d'un run complet sur le nouveau HEAD exact.

## Règle de validation

Ne pas requalifier le run du commit précédent comme preuve du correctif. Le gate reste ouvert jusqu'à un run Actions réussi sur le nouveau HEAD, incluant réellement `npm run test:postgres` sans test ignoré, puis les preuves terrain séparées.
