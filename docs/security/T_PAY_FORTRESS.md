# T.Pay Fortress — Cryptographic Cell Architecture

## FORT-001 — Root trust
The root-trust vault is a trust anchor, not an application data store. Root material must remain in an external HSM/KMS boundary. Application code receives references/operations, never exportable root keys.

## FORT-002 — One vault identity per security layer
Each security/functional layer owns a distinct vault identity, namespace and key reference. A vault never receives another vault's key material.

Initial cells include: Security, Recovery, Identity, AI, Organization, Finance, Ledger, Payment, Wallet, Credit, Provider, Microfinance, Tontine, Data/RAG, Document, Social, Audit/Evidence and Offline/Field.

## FORT-003 — Key hierarchy
Production target:
HSM/KMS Root Trust → vault KEK/wrapping key → vault DEK → encrypted data/object.

DEKs are ephemeral/application-scoped where possible. Root keys are never stored in PostgreSQL, source control, environment variables or model context.

## FORT-004 — Controlled bridges
No direct cross-vault read/write is permitted. A bridge is explicit, directional, purpose-bound, action-bound, data-class-bound and TTL-bound.

## FORT-005 — Security Gateway
Every cross-vault operation must carry:
organization, actor, agent, source vault, target vault, purpose, action, data class, capability, correlation ID, payload hash and expiry.

The gateway must enforce vault status, tenant boundary, bridge policy, capability validity, authorization, replay protection, risk/approval requirements and evidence recording before a side effect.

## FORT-006 — Compromise containment
A compromised vault can be quarantined independently. Quarantine blocks bridge operations involving that vault while unaffected vaults remain operational. Evidence is preserved; recovery requires explicit controlled transition.

## FORT-007 — No universal administrator key
Administrative identity does not imply cryptographic access. Root/financial/security operations require separate authorization and, where applicable, multi-party control.

## FORT-008 — Persistence and RLS
Vault and bridge metadata are persisted with PostgreSQL RLS. Organization-scoped vaults are invisible across tenants. Global root metadata is deliberately non-tenant data and must be protected by separate privileged infrastructure controls.

## FORT-009 — Provider boundary
The repository contains only a fail-closed KMS/HSM adapter contract plus a test-only provider. It is NOT production HSM/KMS activation until a real provider, key ceremony, access policy, rotation and recovery evidence exist.

## FORT-010 — Failure rule
If key provider, vault status, tenant context, authorization, capability, replay protection or security evidence is unavailable, the cross-vault operation fails closed.

## Current state
Implemented in code: vault registry, per-vault key references, testable wrapped DEKs, explicit bridges, quarantine, tenant checks, and PostgreSQL persistence/RLS migration.

Not yet production-ready: real HSM/KMS provider activation, full persistent bridge execution path, full Ledger/Payment wiring, runtime replacement of all in-memory replay/capability paths, PostgreSQL adversarial integration evidence and regulated activation.


## FORT-011 — General Fortress Vault
`general-fortress` is the global containment/control container for Fortress metadata and principal cells. It does not inherit or export child keys. Global access is restricted to the dedicated `tpay_fortress_operator` database role.

## FORT-012 — Coffre-Fort Administrateur
`administrator-fortress` est le coffre global d'administration T.Pay intégré au Coffre-Fort Général. Il contient les domaines d'administration T.Pay et les références de contrôle privilégié, jamais les données métier ordinaires des organisations. Il ne donne aucun accès implicite à Finance, Ledger ou aux autres cellules. Les opérations racine/cryptographiques restent soumises au contrôle séparé et au quorum.

## FORT-013 — Hierarchical key non-inheritance
Parent/child relationships are organizational topology only. A parent vault key cannot decrypt a child vault. A child key cannot decrypt its parent. Every vault has independent key references and authenticated encryption boundaries.

## FORT-014 — Fortress Bridge v2
The bridge is the only data-plane path between vaults. Authorization composes:
1. vault status and tenant binding;
2. explicit bridge policy;
3. ABAC context;
4. persistent capability revocation;
5. persistent replay claim;
6. audit append;
7. signed channel envelope.

No direct database or service-to-service bypass is part of the approved architecture.

## FORT-015 — Fast secure data plane
Control-plane decisions may use persistent PostgreSQL state; payload transport uses a compact signed envelope with tenant, source, target, bridge, purpose, sequence, expiry and payload hash. In production the transport boundary must run over TLS 1.3/mTLS. The database is not used as the payload bus.

## FORT-016 — Finance bridge allowlist
The initial financial policy is deny-by-default. Examples of permitted explicit paths:
- Finance Payment → Finance Ledger
- Finance Wallet → Finance Ledger
- Finance Credit → Finance Ledger
- Finance Microfinance → Finance Tontine

AI, Social, Document, Organization or other cells have no implicit path to Ledger.

## FORT-017 — Root Trust quorum
Root operations require at least two distinct approvers and separation of duties. The initiating actor cannot approve its own operation. Persistent approvals are protected by a dedicated database role.

## FORT-018 — Global access isolation
Tenant RLS sessions cannot read global General Fortress or Administrateur metadata. Global access requires the dedicated Fortress operator database role and explicit privileged session context.

## FORT-019 — Compromise containment
Quarantining a sub-vault blocks its operations while unrelated vaults remain active. Parent containment is not automatically required for a child compromise, and child compromise does not grant parent access.

## FORT-020 — Operational performance rule
Do not put every payload through heavyweight cryptographic key operations or PostgreSQL transactions. Establish/rotate authenticated channels at controlled intervals, keep payloads off the database bus, and use persistent storage for authorization/replay/audit state where the business effect requires durable proof.


## FORT-021 — Coffre-Fort Administrateur hiérarchique
Le Coffre-Fort Administrateur est séparé du Coffre-Fort Général par une identité cryptographique propre. Ses sous-coffres sont indépendants :
- identité administrateur;
- authentification;
- sessions;
- super-admin;
- rôles;
- permissions;
- politiques;
- plateforme;
- configuration;
- feature flags;
- approbations;
- sécurité;
- incidents;
- audit;
- preuves;
- conformité;
- clés;
- récupération;
- opérations;
- urgence.

Le parentage ne transmet jamais une clé. Un administrateur n'obtient pas automatiquement une capacité cryptographique sur un autre coffre.

## FORT-022 — Coffre utilisateur par module
Chaque utilisateur T.Pay reçoit, à l'activation d'un module spécialisé, un compartiment cryptographique propre sous le sous-coffre du module. Le modèle est :

`Coffre Général → Cellule → Sous-coffre Module → Coffre Utilisateur`

Pour Finance par exemple :
`Finance → Payment → User-A`
est cryptographiquement différent de :
`Finance → Payment → User-B`
et de :
`Finance → Ledger → User-A`.

Chaque coffre utilisateur possède son propre identifiant, namespace, référence de clé, propriétaire vérifié, statut et frontière de données. L'identifiant utilisateur brut n'est pas utilisé comme secret cryptographique.

## FORT-023 — Isolation utilisateur/tenant
Une demande utilisateur est autorisée uniquement après vérification de l'identité serveur, de l'organisation courante, de l'appartenance au module et de la propriété du coffre. Un identifiant fourni par le client n'est jamais une preuve d'autorisation.

La RLS PostgreSQL distingue :
- `system`;
- `tenant-user`;
- `global-admin-user`.

Les politiques user-scoped remplacent la politique tenant permissive afin d'empêcher qu'un utilisateur d'une même organisation puisse lire le coffre d'un autre utilisateur.

## FORT-024 — Donnée chiffrée au fondement
La table `fortress_user_data_objects` ne stocke que des données chiffrées et versionnées :
`object_id + version + vault_id + key_version + nonce + ciphertext + auth_tag + AAD hash + payload hash`.

Aucun champ plaintext métier n'est prévu dans cette frontière. Les opérations UPDATE/DELETE ne disposent d'aucune politique RLS par défaut : la donnée protégée est traitée comme une suite de versions immuables. La rotation de clé utilise `key_version` et le HSM/KMS externe; aucune clé brute n'est stockée dans PostgreSQL.

## FORT-025 — Instantané et temps réel
Le modèle ne mélange pas le coffre et le transport. Le coffre protège l'état durable; Fortress Channel transporte les événements signés à faible latence. Chaque événement porte tenant, source, cible, bridge, séquence, expiration et hash du payload. Les projections temps réel peuvent être reconstruites depuis les données versionnées et l'audit.

## FORT-026 — Règle de communication
Utilisateur → module → coffre utilisateur → sous-coffre module → cellule → autre cellule n'est jamais un accès direct. Chaque franchissement de frontière utilise le Fortress Gateway, un bridge explicite, ABAC, capability, anti-replay et audit. Les payloads ne transitent pas par PostgreSQL comme bus.

## FORT-027 — Rotation et récupération
Chaque coffre utilisateur est conçu pour une rotation indépendante de clé. Une compromission d'un utilisateur ou d'un module permet de révoquer/quarantainer le coffre concerné sans réutiliser ou exposer les clés des autres utilisateurs. La récupération exige une procédure contrôlée; elle ne réactive pas silencieusement une capacité révoquée.

## FORT-028 — Référence normative
La conception suit notamment les principes OWASP de séparation des clés et données, chiffrement authentifié, rotation, séparation tenant/utilisateur et autorisation avant accès aux objets. Les recommandations publiques OWASP confirment l'intérêt des clés séparées, de l'enveloppe DEK/KEK, des modes authentifiés et d'une isolation explicite des objets user-scoped.


## FORT-029 — Sensitive Data Exposure Guard
`packages/security/src/fortress-exposure-guard.ts` ajoute une barrière de réduction d'exposition pour logs, erreurs, télémétrie, exports, contexte IA et notifications :
- suppression récursive des champs secrets/identifiants sensibles connus;
- nettoyage de clés privées PEM, bearer tokens, JWT et affectations de secrets dans les chaînes;
- classification de sortie, limites de taille, digest et chemins expurgés;
- erreurs client normalisées sans stack, SQL, chemins ou réponse fournisseur;
- télémétrie par enveloppe autorisée, digest et compteur de champs expurgés;
- exports refusés sans contexte acteur et finalité.

Cette couche est une défense en profondeur. Elle ne remplace ni l'autorisation par objet, ni la minimisation des données à la source, ni un contrôle de classification fiable. La détection heuristique ne garantit pas la reconnaissance de chaque donnée personnelle; les schémas métier doivent définir explicitement les champs autorisés.

## FORT-030 — Secret non observabilité
Aucun secret brut, jeton d'accès, contenu KYC, numéro de compte ou contenu de document privé ne doit être journalisé. Les journaux utilisent identifiants de corrélation, catégories d'événements, décisions et empreintes; les valeurs sensibles sont exclues. Les erreurs publiques sont génériques, tandis que les détails diagnostiques restent dans un canal privé avec accès contrôlé.

## FORT-031 — Contrôle d'export et contexte IA
Tout export, notification ou assemblage de contexte IA doit préciser l'acteur authentifié, la finalité, la classification autorisée et la limite de taille. Le refus est le comportement par défaut en l'absence de contexte ou si la classification dépasse le niveau autorisé.

## FORT-032 — Intégration et gates de sortie
Intégrations désormais présentes dans le code :
- `SecurityMonitor.record()` expurge les métadonnées avant stockage mémoire et avant le calcul du hash d'audit; les identifiants de tenant mal formés sont refusés.
- `enforceOutputBoundary()` fait passer les sorties IA par le guard après la politique de classification et la réduction des clés sensibles.
- Le guard nettoie aussi les PII incluses dans du texte libre (e-mails, téléphones, identifiants de paiement, certains identifiants de passeport) et des motifs de jetons fournisseurs courants.

Intégrations encore non démontrées : gestionnaire d'erreurs HTTP réel, logger applicatif général, traces/metrics, export documentaire, notifications, prompts/RAG en amont, adaptateurs fournisseurs et artefacts CI. La fonction `safeClientError()` n'est pas un remplacement d'un middleware HTTP et la fonction `safeSecurityTelemetry()` n'est pas une preuve que tous les émetteurs de télémétrie l'utilisent.

La détection reste heuristique, non une solution DLP exhaustive. Les tests d'intégration utilisent des données synthétiques; la CI sur le SHA exact, la revue de sécurité et les tests de fuite sur logs/artifacts demeurent obligatoires avant certification.
