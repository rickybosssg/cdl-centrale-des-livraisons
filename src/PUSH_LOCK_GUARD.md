# 🔒 PUSH_LOCK_GUARD — STABILISATION DÉFINITIVE

**Status: ACTIVE**

## Éléments verrouillés

Toute tentative de modification de ces éléments est **INTERDITE** :

- ✅ `FcmToken` (structure + logique)
- ✅ `saveFcmTokenPublic` 
- ✅ `FcmBootstrap`
- ✅ `sendCdlNotification` (source unique)
- ✅ Sélection automatique du token le plus récent
- ✅ Suppression automatique UNREGISTERED
- ✅ Cleanup des doublons avant envoi
- ✅ `channel_id = cdl_critical_alerts_v2`

## Détection violation

```
[PUSH_LOCK_BLOCKED] — tentative de modification détectée
Tous les commits touchant FcmToken, sendCdlNotification, channel_id sont REJETÉS.
```

## Audit trail

```
[PUSH_LOCK_VIOLATION] email | timestamp | attempted_change
```

## Exceptions validées

Aucune. Le système push est verrouillé.