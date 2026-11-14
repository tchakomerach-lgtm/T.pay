# T.Pay Experience OS — Motion Design 3D (MOTION-001)

## Objectif
Définir une grammaire de profondeur et de mouvement commune aux rendus React Web et Flutter Mobile. La profondeur renforce la hiérarchie et l'affordance; elle ne doit jamais devenir une dépendance à la compréhension ou à la confirmation d'une action.

## Langage visuel
- Surfaces : élévation légère, ombres diffuses, bordures à faible contraste.
- Cartes : perspective subtile, translation verticale limitée, relief de l'icône.
- Hero : volume 3D abstrait de marque, éclairage radial et gradient vert.
- Navigation : transition de fondu + translation courte, sans déplacement brusque de contenu.
- États métier : confirmation, erreur, permission refusée et statut financier restent stables, explicites et non animés de façon distrayante.

## Contrat partagé
La source d'autorité est `design-contract.json` version 1.1.0, copiée à l'identique dans le renderer React et dans les assets Flutter. Le contrôle CI vérifie l'égalité binaire et la présence des tokens motion.

| Token | Web | Mobile |
|---|---:|---:|
| Transition rapide | 160 ms | — |
| Transition standard | 280 ms | 320 ms |
| Transition lente | 520 ms | — |
| Perspective | 1400 px | 0.001 |
| Courbe | cubic-bezier(.2,.75,.25,1) | easeOutCubic |

## Performance et accessibilité
- Pas de scène WebGL/Unity nécessaire à la navigation : CSS 3D et Matrix4 natif suffisent.
- Pas d'animation GPU permanente sur les listes ou les tableaux.
- Les animations sont courtes, bornées et décoratives.
- Le Web respecte `prefers-reduced-motion`.
- Sur les appareils mobiles modestes, les effets de profondeur peuvent être désactivés sans perte fonctionnelle.
- Les interactions financières, OTP, confirmations, autorisations et erreurs de sécurité ne dépendent jamais d'une animation.
- Les contrastes, focus clavier, tailles tactiles et états sémantiques restent prioritaires.

## Contrôles d'acceptation
1. Le contrat JSON Web/Mobile est identique.
2. Le build React de production passe.
3. Flutter analyze, tests widget et build APK passent.
4. Navigation utilisable sans animation.
5. Aucun appel API ni mutation métier n'est déclenché par une animation.
6. Le rendu reste exploitable sur petit écran et avec faible puissance graphique.

## Limite de livraison
MOTION-001 fournit le système visuel et les transitions du shell Experience OS. Il ne signifie pas que les 18 modules métier disposent déjà de leurs écrans de données, endpoints, permissions et workflows complets.
