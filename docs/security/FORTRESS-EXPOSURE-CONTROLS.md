# T.Pay Fortress — exposition des données sensibles

## Contrôle FORT-EXPO-001 — Guard central

`packages/security/src/fortress-exposure-guard.ts` fournit un filtre défensif pour les chaînes et objets qui traversent une frontière de confiance. Il masque les clés sensibles reconnues, les e-mails, les téléphones, certains identifiants de paiement, des identifiants de passeport et plusieurs formats courants de jetons.

Le guard borne aussi la profondeur récursive et la taille d'entrée, rejette les objets non sérialisables, et crée les propriétés de sortie sans permettre à une clé `__proto__` de modifier le prototype. Ces contrôles réduisent les risques de déni de service et de pollution de prototype; ils ne remplacent pas une validation de schéma à l'entrée.

Le filtrage par motif est une défense en profondeur, pas un moteur DLP exhaustif. Les schémas métier et les autorisations par tenant restent la source de vérité.

## Contrôle FORT-EXPO-002 — Erreurs HTTP

`normalizeApiError()` n'autorise que des codes d'erreur publics explicitement listés. Tout code interne inconnu devient `API_INTERNAL_ERROR`. L'identifiant de corrélation est validé et expurgé s'il ressemble à une donnée personnelle ou à un secret. Le gestionnaire HTTP renvoie le statut normalisé plutôt que d'exposer le message d'exception.

## Contrôle FORT-EXPO-003 — Sorties IA

Les chemins `AiCore.generate()` et `AiCore.generateRouted()` font passer le texte de sortie des fournisseurs par le guard avant de le rendre à l'appelant. Les réponses sont limitées à 1 000 000 octets après expurgation. Les données de contexte avant envoi aux fournisseurs, les journaux généraux, les exports et les notifications nécessitent encore des contrôles dédiés.

## Contrôle FORT-EXPO-004 — Tests de régression

Les tests vérifient :
- les codes d'erreur internes remplacés par un code générique ;
- la non-réflexion des e-mails, téléphones et chaînes de type Bearer ;
- l'expurgation des données sensibles dans les sorties IA directes et routées ;
- le maintien de codes publics documentés ;
- la résistance aux clés `__proto__`, à la profondeur excessive et aux entrées trop volumineuses.

## Gates de certification

Aucune certification n'est implicite dans la présence de ces fichiers. La CI sur le SHA exact doit réussir. Les chemins de logs, traces, métriques, exports documentaires, notifications, prompts/RAG et adaptateurs fournisseurs doivent être examinés séparément. HSM/KMS réel, tests PostgreSQL concurrents et exercices red-team restent des contrôles distincts.
