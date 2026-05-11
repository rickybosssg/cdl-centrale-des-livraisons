# 🔒 ARCHITECTURE PUSH V3 — VERROUILLÉE (NE PAS MODIFIER)

## Date de validation : 2026-05-12
## Statut : ✅ FONCTIONNEL — firebase_message_id confirmé

---

## Canal unique officiel

```
id: cdl_critical_alerts_v3
importance: 5 (IMPORTANCE_MAX)
sound: default
vibration: true
lights: true
visibility: 1 (PUBLIC — écran verrouillé)
priority: HIGH/MAX (FCM android.priority = HIGH)
```

## Sources synchronisées (3 fichiers — toujours modifier ensemble)

| Fichier | Rôle |
|---------|------|
| `functions/sendCdlNotification` | Envoi FCM via Firebase API v1 |
| `lib/nativePush.js` | Canal Android Capacitor |
| `components/FcmBootstrap` | Bootstrap APK + création canal |

## Token FCM

- **Lié à `user_email` uniquement** (pas au profil actif)
- 1 seul token actif par `user_email` (cleanup automatique à chaque save)
- Tokens synthétiques (`synth_*`, `audit_*`, `test_*`) filtrés automatiquement
- Sauvegarde via `saveFcmTokenPublic` (endpoint public, auth souple)

## Réception garantie (4 cas)

| Cas | Mécanisme |
|-----|-----------|
| App ouverte (foreground) | `pushNotificationReceived` → toast sonner |
| App arrière-plan | FCM système Android → barre de statut |
| App fermée | FCM système Android → barre de statut |
| Écran verrouillé | `visibility: PUBLIC` → visible sur lock screen |

## Anti-Doze / Batterie

- `requestBatteryOptimizationExempt()` appelé au démarrage (FcmBootstrap)
- Cible : Samsung, Xiaomi, Tecno (fabricants avec kill agressif)
- Non-bloquant : si refus, FCM continue via FCM high-priority

## Multi-profils

- Token lié à `user_email` → survit au changement de profil (client/livreur/partenaire/commercial/admin)
- `sendCdlNotification` résout les destinataires par `user_email` ou `role`
- Aucune perte de token lors de `switchActiveProfile`

## Logs de monitoring

```
[FCM_REGISTER_SUCCESS]    Token Firebase enregistré
[FCM_TOKEN_RECEIVED]      Token reçu dans FcmBootstrap.onToken
[FCM_SAVE_ATTEMPT]        Appel saveFcmTokenPublic lancé
[FCM_SAVE_SUCCESS]        Token sauvegardé en BDD
[FCM_SAVE_FAILED]         Échec sauvegarde
[FCM_CHANNEL_CHECK]       Canal Android créé/vérifié
[FCM_BATTERY_OPT]         Demande exemption batterie
[FCM_PERMISSION_CHECK]    Vérification permission Android
[FCM_PERMISSION_GRANTED]  Permission accordée
[FCM_PERMISSION_DENIED]   Permission refusée → bannière
[CDL_PUSH_SENT]           Push envoyé à Firebase (succès)
[FCM_SEND_RESULT]         Résultat par token
[PUSH_V2_AUTH_START]      Début auth sendTestPush
[PUSH_V2_AUTH_OK]         Auth réussie
[PUSH_V2_AUTH_FAILED]     Auth échouée (fallback email)
[PUSH_V2_SEND_START]      Début envoi test push
[PUSH_V2_SEND_SUCCESS]    Push test livré à Firebase
[PUSH_V2_SEND_ERROR]      Échec envoi test push
```

## Canaux legacy supprimés

- `default`
- `CDL_ALERTS_HIGH`
- `urgent`
- `cdl_default_v2`
- `cdl_critical_alerts_v1`
- `cdl_critical_alerts_v2`

## RÈGLES ABSOLUES

1. Ne jamais changer `CDL_CHANNEL_ID` sans mettre à jour les 3 fichiers
2. Ne jamais ajouter de guard `_registered` dans `nativePush.js`
3. `register()` doit être appelé à chaque démarrage (idempotent Firebase)
4. Les listeners doivent être attachés AVANT `register()`
5. `sendCdlNotification` est la SEULE source d'envoi FCM
6. Ne jamais envoyer depuis le frontend directement
7. FcmToken lié à `user_email` uniquement — jamais au profil