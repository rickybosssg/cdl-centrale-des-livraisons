# 🔒 VERROUILLAGE ANTI-RÉGRESSION — SYSTÈME NOTIFICATIONS PUSH CDL
## Version stable : 3.0 — Canal : cdl_critical_alerts_v2

---

## ⛔ FICHIERS VERROUILLÉS — NE JAMAIS MODIFIER

| Fichier | Rôle | Règle |
|---|---|---|
| `functions/sendCdlNotification` | Envoyeur FCM unique | NE JAMAIS MODIFIER |
| `components/FcmBootstrap` | Init FCM natif + listeners | NE JAMAIS MODIFIER |
| `components/FcmStatusPanel` | Panneau état FCM | NE JAMAIS MODIFIER |
| `components/FcmPushHistory` | Historique push | NE JAMAIS MODIFIER |
| `pages/FcmDiagnostic` | Diagnostic complet | NE JAMAIS MODIFIER |
| `functions/validateBedouRequest` | Validation Bedou + FCM direct | NE JAMAIS MODIFIER |
| Logique token FCM (save/retry/deactivate) | Lifecycle tokens | NE JAMAIS MODIFIER |

---

## 🔒 CANAL VERROUILLÉ

```
CDL_CHANNEL = "cdl_critical_alerts_v2"
```

- **Android importance = 5** (heads-up garanti)
- **Ce canal est figé par Android** dès la première installation
- Changer l'ID = revenir à un canal sans importance connue → pas de heads-up
- **JAMAIS** utiliser : `default`, `CDL_ALERTS_HIGH`, `urgent`, `cdl_default_v2`

---

## ✅ RÈGLES POUR TOUTE NOUVELLE NOTIFICATION

### ✅ FAIRE
```js
// CORRECT — extension via sendCdlNotification
await base44.asServiceRole.functions.invoke('sendCdlNotification', {
  user_email: "user@example.com",  // OU role: "admin"
  title: "Titre obligatoire",      // NE JAMAIS OMETTRE
  body: "Corps obligatoire",        // NE JAMAIS OMETTRE
  data: {
    type: "mon_event_type",         // identifiant unique
    entity_id: "...",
    entity_type: "...",
    notif_route: "/ma-page",        // deep link
  },
});
```

### ❌ NE JAMAIS FAIRE
```js
// ❌ Utiliser un autre channel_id
android: { notification: { channel_id: "default" } }  // INTERDIT

// ❌ Contourner sendCdlNotification
await fetch("https://fcm.googleapis.com/...")          // INTERDIT

// ❌ Omettre title ou body dans sendCdlNotification
{ user_email: "...", data: {...} }                     // INTERDIT — title + body manquants

// ❌ Écraser un token valide avec un token vide
if (!newToken) saveFcmToken(newToken)                  // INTERDIT

// ❌ Créer une fonction de notification parallèle
// sendMyOwnNotification(), pushDirect(), etc.         // INTERDIT
```

---

## 🛡️ GARDES-FOUS DÉVELOPPEUR

Avant tout commit modifiant les notifications, vérifier :

- [ ] **channel_id** = `cdl_critical_alerts_v2` uniquement
- [ ] **sendCdlNotification** est le seul point d'entrée FCM (hors `validateBedouRequest` qui a son propre FCM direct pour raisons de sécurité atomique)
- [ ] **payload.title** et **payload.body** présents et non-vides
- [ ] **token FCM** non-vide avant toute sauvegarde
- [ ] **retry automatique 1x** conservé dans `sendFcmDirect`
- [ ] **logs** `sent/failed/delay_ms/channel_id` conservés
- [ ] Aucun `throw` bloquant dans les handlers de notification
- [ ] Toujours retourner `{ ok: true }` dans les automations entity

---

## ✅ CHECKLIST OBLIGATOIRE AVANT PUBLICATION

### Tests push système (à faire sur APK physique Android)

| Test | Statut attendu | Valider |
|---|---|---|
| App **ouverte** → toast + notification barre | Push visible | ☐ |
| App **arrière-plan** → notification barre système | Push visible | ☐ |
| App **fermée** → notification barre système | Push visible | ☐ |
| Tap notification → deep link correct | Navigation OK | ☐ |
| **Notification admin** (nouvelle course) | `sent > 0` | ☐ |
| **Notification client** (course créée) | `sent > 0` | ☐ |
| **Recharge Bedou validée** → client notifié | `sent > 0` | ☐ |
| **Nouvelle course** → livreur notifié | `sent > 0` | ☐ |
| **Course acceptée** → client notifié | `sent > 0` | ☐ |
| **Message reçu** → destinataire notifié | `sent > 0` | ☐ |
| `channel_id` = `cdl_critical_alerts_v2` dans logs | Exact | ☐ |
| `sent > 0` | Au moins 1 | ☐ |
| `failed = 0` | Zéro | ☐ |
| `delay_ms < 3000` | Performance OK | ☐ |
| BDD notification créée (fallback) | Toujours créée | ☐ |

**Règle** : Si un test échoue → NE PAS PUBLIER → rollback immédiat

---

## 🔄 PROCÉDURE EN CAS D'ÉCHEC

1. **Ne pas publier** le build APK
2. **Identifier** le commit / la fonction modifiée
3. **Rollback** via git ou restauration du fichier verrouillé
4. **Conserver** les logs d'erreur (`fcm_sent=0`, `registrationError`, etc.)
5. **Re-tester** sur `/fcm-diagnostic` avant toute nouvelle tentative
6. **Vérifier** : SHA-1 keystore, google-services.json, npx cap sync

---

## 📊 MÉTRIQUES DE SANTÉ SYSTÈME (valeurs de référence)

```
sendCdlNotification :
  sent     = 2      ✅ (2 tokens actifs)
  failed   = 0      ✅
  bdd      = 1      ✅
  elapsed  = ~700ms ✅
  channel  = cdl_critical_alerts_v2 ✅

validateBedouRequest :
  notification_client_sent = true  ✅
  fcm_sent   = 2   ✅
  fcm_failed = 0   ✅
  channel_id = cdl_critical_alerts_v2 ✅
  delay_ms   = ~1500ms ✅
```

---

## 📋 ARCHITECTURE NOTIFICATIONS CDL

```
Événement métier
      │
      ▼
automation entity (create/update)
      │
      ▼
notifyXxxEvents (handler)
      │
      ▼
sendCdlNotification (point d'entrée unique)
      │
      ├── createInternalNotif → Notification BDD (fallback garanti)
      │
      └── FCM v1 API → Android push (cdl_critical_alerts_v2)
                │
                ├── retry automatique 1x (1.5s délai)
                ├── désactivation tokens UNREGISTERED/INVALID_ARGUMENT
                └── logs sent/failed/delay_ms/channel_id
```

---

## 🚫 RÈGLE ABSOLUE

> **Le système push actuel est stable.**
> **Toute modification future doit être une EXTENSION sans régression.**
> **On n'améliore pas les notifications en REMPLAÇANT.**
> **On améliore uniquement en AJOUTANT.**

---

*Verrouillé le 2026-05-03 — Version stable confirmée par tests : sent=2, failed=0, channel=cdl_critical_alerts_v2*