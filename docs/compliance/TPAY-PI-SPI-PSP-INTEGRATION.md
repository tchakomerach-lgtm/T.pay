# PI-SPI, établissements de paiement et mobile money — intégration T.Pay

Date de vérification : 28 novembre 2026. Ce registre n'est ni un contrat opérateur ni un avis juridique.

## Architecture et vocabulaire

T.Pay doit distinguer trois couches :
- Mobile money : Mixx by Yas/T-Money et Moov Money/Flooz.
- Prestataires de services de paiement (PSP) et établissements de paiement (EP), partenaires contractuels possibles selon leur agrément et leur mandat.
- PI-SPI BCEAO : plateforme interopérable de paiement instantané UEMOA et API-Business exposées par les participants homologués. PI-SPI n'est pas un opérateur mobile money et ne constitue pas un agrément détenu par T.Pay.

Le sigle « ISP » n'est pas assez précis. Le besoin est traité ici comme intégration des PSP/EP et de PI-SPI; le terme réglementaire de l'Instruction BCEAO est « établissement de paiement ».

## Écosystème confirmé par les sources publiques

Instruction BCEAO n°001-01-2024 : définit les services de paiement et limite les services fournis par un EP au périmètre de son agrément/enregistrement. Les partenariats entre prestataires sont encadrés et ne peuvent comporter de clause d'exclusivité.

Liste BCEAO des EP agréés au 31 août 2026 :
- INTOUCH Togo — EP.TG.001/2025
- OLLO AFRICA — EP.TG.002/2025
- SEMOA Togo — EP.TG.003/2026

Liste de la Commission Bancaire UMOA, mise à jour au 29 juin 2026 : T-Money est répertorié comme établissement de monnaie électronique EME.TG.026/2025.

Liste des participants PI-SPI publiée au 30 septembre 2026 : au Togo, elle comprend notamment des banques, Mixx Togo, Moov Money et COFINA. Être participant PI-SPI ne prouve pas à lui seul qu'une API-Business donnée est homologuée ni qu'un contrat marchand avec T.Pay existe.

La liste officielle BCEAO des API-Business PI-SPI homologuées au 9 novembre 2026 recense 34 API dans l'UEMOA. Pour le Togo, elle ne nomme qu'un participant : ECOBANK. C'est donc le premier interlocuteur PI-SPI à solliciter pour le Togo. Cette homologation de l'API-Business ne signifie pas que T.Pay dispose déjà d'un contrat, d'un accès sandbox, de certificats ou d'identifiants.

## Partenaires à approcher — aucun contrat n'est réputé signé

| Candidat | Statut public vérifié | Dossier à obtenir |
|---|---|---|
| Mixx by Yas / T-Money | EME Togo référencé; parcours marchand publié par Yas | Contrat marchand, API versionnée, sandbox, callbacks, sécurité, frais, remboursements et règlement |
| Moov Money / Flooz | Service mobile money présent au Togo; procédure marchande publique historique | Contrat actuel, spécification API officielle, sandbox, signature callback, frais et règlement |
| INTOUCH Togo | EP agréé EP.TG.001/2025 | Mandat, produits/canaux, contrat, API, preuves de conformité et sous-traitants |
| OLLO AFRICA | EP agréé EP.TG.002/2025; communication publique mentionne PIS/AIS | Contrat, périmètre autorisé, API et statut PI-SPI homologué applicable |
| SEMOA Togo | EP agréé EP.TG.003/2026 | Offre entreprise, contrat, API, sandbox, responsabilités de règlement et statut PI-SPI |
| ECOBANK Togo | Seule API-Business PI-SPI explicitement listée pour le Togo au 9 novembre 2026 | Contrat API-Business entreprise, dossier marchand, accès sandbox, certificats, clés, webhooks et règles de règlement |
| Autres participants PI-SPI au Togo (banques, Mixx, Moov Money, COFINA) | Participants autorisés au public selon la liste du 30 septembre 2026; leur présence ne vaut pas homologation API-Business au 9 novembre | Vérifier l'homologation API-Business exacte et le contrat avant intégration |

Les agréments publics ne remplacent ni le contrat commercial ni l'autorisation contractuelle d'utiliser une API.

## Capacités API-Business PI-SPI annoncées par le portail développeur

- Création d'alias de compte et QR codes pour recevoir des paiements.
- Paiements unitaires et groupés.
- Demandes de paiement adressées au client.
- Suivi des transactions et rapprochement des factures/paiements.
- Notifications temps réel par webhooks sécurisés avec signature et mécanismes de reprise.

Le fichier packages/finance/src/pi-spi-business.ts expose un port interne typé couvrant ces opérations. Ce n'est pas un client HTTP PI-SPI et il ne contient aucun champ réseau supposé. Le transport réel doit être développé à partir de la spécification API-Business homologuée remise par le participant contractant.

## Pièces contractuelles à obtenir pour chaque partenaire

1. Contrat signé et annexes tarifaires.
2. Entité juridique, numéro d'agrément/enregistrement et périmètre des services.
3. Spécification API officielle, version, URLs sandbox et production.
4. Schémas de requêtes/réponses, statuts et transitions.
5. Authentification, signature callbacks, canonicalisation, rotation et révocation des clés.
6. mTLS/certificats, IP allowlist, exigences TLS et gestion des incidents.
7. Identifiants d'événements, idempotence, retries, timeouts et limites.
8. Règlement, compte bénéficiaire, cut-off, frais, taxes, remboursements et réversals.
9. KYC/AML, réclamations, fraude et support opérationnel.
10. Jeux d'essai officiels, procès-verbal de recette et autorisation de mise en production.

## Garde-fous de production

- Secrets dans un coffre/secret manager, jamais dans Git.
- Aucun appel production sans contrat actuel, spécification versionnée et environnement certifié.
- Callbacks vérifiés sur le corps brut, authentifiés, datés, protégés contre le rejeu et rapprochés de l'intention exacte.
- Montants en unités mineures entières XOF; organisation, bénéficiaire, référence et idempotency key doivent correspondre.
- « accepted », « pending » et timeout ne sont jamais un règlement confirmé.
- Seul le Settlement Orchestrator effectue le règlement atomique Financial Core.
- Paiements ambigus mis en quarantaine et rapprochés; aucun crédit optimiste.
- Pilote plafonné par organisation et partenaire, puis activé par approbation humaine.
- T.Pay ne doit pas se présenter comme établissement de paiement sans agrément applicable.

## État GitHub de cette brique

La branche ajoute :
- packages/finance/src/pi-spi-business.ts : port PI-SPI avec preuve contractuelle, contrôle d'activation, isolation tenant, XOF, alias, paiement unitaire, demande, bulk et interrogation.
- tests/pi-spi-business.test.ts : tests des garde-fous.
- Le transport réseau réel, les credentials, callbacks PI-SPI et recette opérateur restent bloqués par l'absence de contrats et spécifications privées.

## Sources

- BCEAO, Instruction n°001-01-2024 : https://www.bceao.int/sites/default/files/inline-files/Instruction-No001-01-2024_relative_aux_services_de_paiement_dans_l-UMOA.pdf
- BCEAO, liste EP agréés au 31 août 2026 : https://downloads.bceao.int/index.php/fr/communique-presse/liste-des-etablissements-de-paiement-agrees-dans-lumoa-au-31-aout-2026
- Commission Bancaire UMOA, établissements assujettis : https://www.cb-umoa.org/fr/etablissements-assujettis-au-controle-de-la-commission-bancaire-de-lumoa
- BCEAO, liste PDF des API-Business PI-SPI homologuées au 9 novembre 2026 : https://downloads.bceao.int/sites/default/files/2026-11/liste_des_api-business_pi-spi_homologuees_Nov_2026-11-09.pdf
- BCEAO, participants PI-SPI autorisés au public au 30 septembre 2026 : https://downloads.bceao.int/index.php/fr/communique-presse/liste-des-participants-autorises-ouvrir-les-services-de-pi-spi-au-public-au-30
- Portail développeur PI-SPI : https://developer.pispi.bceao.int/home
- Yas Togo, accepter les paiements Mixx : https://togocom.zendesk.com/hc/fr/articles/40486059403410-Accepter-les-paiements-Mixx-sur-votre-site-ou-votre-application
- Procédure marchande Flooz publique historique, à revalider auprès de Moov : https://github.com/Tech228/FloozAPI/blob/master/Procedures.md