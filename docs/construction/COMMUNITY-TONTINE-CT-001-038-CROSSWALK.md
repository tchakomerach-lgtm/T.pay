# Crosswalk — reconstruction CT-001 à CT-038 ↔ Bibles T.Pay

**Nature :** identifiants CT reconstruits dans la conversation du 17 novembre 2026. Ils ne remplacent pas la numérotation historique originale des prompts communautaires 001–031. Le registre historique demeure `COMMUNITY-TONTINE-PROMPTS-001-031-REGISTER.md`.

| Référence CT | Domaine | Références sources à préserver |
|---|---|---|
| CT-001 | Création du domaine communautaire indépendant | ADR-004, ADR-006, TPAY-CONSTRUCTION-001 |
| CT-002 | Architecture et frontières métier | ADR-004, Implementation Map |
| CT-003 | Identité, sessions et multi-organisations | ADR-006, TPAY-AUTH-002, TPAY-SEC-001 |
| CT-004 | Modèle PostgreSQL et RLS | migrations 100–133, TPAY-SEC-001 |
| CT-005 | Création de groupes | ADR-004, Tontine Cycle Bible |
| CT-006 | Invitations et adhésions | Prompt historique 004, admission/recruitment |
| CT-007 | Profils et membres | Prompt historique 004, Identity Core |
| CT-008 | Rôles et permissions | ADR-006, P056/P057, temporal grants |
| CT-009 | Règlement intérieur versionné | Governance Bible, prompt historique 001 |
| CT-010 | Cycles | TPAY-TONTINE-CYCLE-001 |
| CT-011 | Échéanciers et cotisations | ADR-004, settlement orchestrator |
| CT-012 | Rotation bénéficiaires | TONTINE-ROTATION-PAYOUT-001 |
| CT-013 | Retards et régularisation | Tontine cases/refunds, reconciliation |
| CT-014 | Paiements multicanaux et commissions | GAIN-004 à GAIN-008, FIN-002, ADR-011 |
| CT-015 | Collecte physique et agents | MF-002, offline operations, field continuity |
| CT-016 | Callbacks, signature et anti-rejeu | FIN-002, S-03.2, L14.3 |
| CT-017 | Reçus et carnet électronique | ADR-006 settlement orchestrator, GAIN-005 |
| CT-018 | Réconciliation financière | GAIN-005 à GAIN-008, ADR-007 |
| CT-019 | Décaissement et double approbation | FIN-002, maker/checker, Financial Core |
| CT-020 | Remboursements et reversals | GAIN-005, Financial Core, Tontine cases/refunds |
| CT-021 | Gouvernance démocratique | Social/Governance Bible, prompt historique 001 |
| CT-022 | Propositions et modifications | Governance Bible, versioned rules |
| CT-023 | Incidents et litiges | Prompt historique 020, Tontine cases/refunds |
| CT-024 | Médiation et résolution | Trust/Dispute Bible, human decision boundary |
| CT-025 | Preuves numériques | Security Bible, vault, append-only audit |
| CT-026 | Mode hors connexion | Offline Bible, signed envelopes, reconciliation |
| CT-027 | Notifications | Construction-001 notification security gate |
| CT-028 | Rapports | Finance, audit and organization reporting rules |
| CT-029 | Assistance IA | AI-001, deny-by-default tools, human approval |
| CT-030 | Interface Web | DB-074, Design Bible |
| CT-031 | Flutter et Android | DB-074, Flutter/Web parity, terrain gates |
| CT-032 | Motion design 3D | Design Bible, shared motion contract |
| CT-033 | Accessibilité terrain | Design Bible, offline/low-bandwidth rules |
| CT-034 | APIs et événements | API Gateway, Identity Core, Outbox |
| CT-035 | Sécurité et isolation | SEC-001, ADR-006, Threat Model |
| CT-036 | Observabilité et continuité | Observability Bible, SRE controls |
| CT-037 | Tests et concurrence | Construction-001, PostgreSQL live, security fortress |
| CT-038 | Livraison et certification | AGENTS.md Definition of Done, release gates |

## Décisions commerciales historiques — GAIN

- GAIN-004 est la source du moteur de commission configurable par niveau de transaction.
- GAIN-005 est la source de vérité du Ledger et de l'immutabilité comptable.
- GAIN-006 à GAIN-008 encadrent l'allocation, le règlement et les contrôles de revenus.
- Les frais doivent être présentés et acceptés avant exécution; le snapshot versionné est immuable.
- Les payeurs possibles sont membre, bénéficiaire ou partage explicite.
- Les parts T.Pay, partenaire, agent, réserve, taxes et services optionnels restent séparées.
- Les commissions de partenariat microfinance-école (part T.Pay de 5–10% des commissions mensuelles négociables) ne sont pas transposées automatiquement aux tontines communautaires.
- Les promotions et récompenses d'ambassadeurs sont distinctes des commissions de transaction; une récompense de recrutement n'est éligible qu'après la première cotisation réglée par Financial Core et revue anti-fraude claire.

## Règle de résolution des conflits

En cas de divergence, la Bible historique source, l'ADR accepté et les invariants du Financial Core prévalent sur la formulation reconstruite des CT. Toute modification métier exige une décision versionnée, un audit et des tests de non-régression. Ne jamais marquer une source historique comme récupérée si seul un résumé est disponible.
