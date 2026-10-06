# T.Pay Universal Client

Client React Native/Expo commun Android, iOS et Web.

- Expo SDK 57 / React Native 0.86 / React 19.2.3.
- New Architecture.
- Données métier via API distante.
- Web: session serveur HttpOnly.
- Native: secrets destinés au client natif à stocker via SecureStore, jamais localStorage/AsyncStorage.
- Aucune logique financière critique dans le client.
- Les permissions, l'idempotence, la pagination et le ledger restent côté serveur.

```bash
cd apps/universal
npm install
EXPO_PUBLIC_TPAY_API_URL=https://api.example.tg npm run web
```

Pour Android:
```bash
EXPO_PUBLIC_TPAY_API_URL=https://api.example.tg npm run android
```
