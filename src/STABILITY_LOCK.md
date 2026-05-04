# 🔒 CDL_STABLE_BEDOU_PUSH_V1 — VERROUILLAGE GLOBAL NOTIFICATIONS

**Version :** CDL_STABLE_BEDOU_PUSH_V1  
**Date freeze :** 2026-05-04  
**Statut :** ✅ PRODUCTION STABLE — PRÊT POUR REBUILD APK  

---

## ✅ CERTIFICATION DE NON-RÉGRESSION (dernière exécution)

```
testAllPushNotifications — ALL PASSED (5/5)
────────────────────────────────────────────────────────────────
timestamp          : 2026-05-04T12:54:56.224Z
admin_email        : weezyh2@gmail.com
total_delay_ms     : 3537ms (< 5000ms ✅)
channel_id         : cdl_critical_alerts_v2

REAL_BEDOU_RECHARGE_PUSH_TEST  ✅  sent=1  failed=0  delay=531ms
REAL_COURSE_PUSH_TEST          ✅  sent=1  failed=0  delay=509ms
REAL_PROFILE_PUSH_TEST         ✅  sent=1  failed=0  delay=434ms
REAL_MALL_PUSH_TEST            ✅  sent=1  failed=0  delay=508ms
REAL_ADMIN_ALERT_PUSH_TEST     ✅  sent=1  failed=0  delay=433ms
```

---

## 🏗️ ARCHITECTURE NOTIFICATIONS — SOURCE UNIQUE

**Règle absolue :** 100% des push CDL passent par `sendCdlNotification`.  
Aucune logique FCM directe n'est autorisée dans les fonctions métier.

```
Événement                         Fonction source              Via
──────────────────────────────────────────────────────────────────────
Nouvelle recharge Bedou        →  submitBedouRecharge      →  FCM direct admins (synchrone avant réponse)
Validation/Refus recharge      →  validateBedouRequest     →  sendCdlNotification → client
Nouveau retrait Bedou          →  notifyRetraitEvents      →  sendCdlNotification → admins
Validation/Refus retrait       →  notifyRetraitEvents      →  sendCdlNotification → client
Nouvelle course créée          →  notifyNewCourse          →  sendCdlNotification → client + admins
Course assignée livreur        →  notifyCourseEvents       →  sendCdlNotification → livreur
Course acceptée/en cours/livrée→  notifyCourseEvents       →  sendCdlNotification → client + livreur
Course annulée                 →  notifyCourseEvents       →  sendCdlNotification → client + livreur
Nouveau profil (create)        →  notifyProfileEvents      →  sendCdlNotification → admins
Profil validé/refusé/suspendu  →  notifyProfileEvents      →  sendCdlNotification → utilisateur
Nouvelle commande Mall         →  notifyCommandeEvents     →  sendCdlNotification → partenaire + admins
Commande acceptée/livrée/annulée → notifyCommandeEvents    →  sendCdlNotification → client + partenaire
```

**Canal unique verrouillé :** `cdl_critical_alerts_v2` (importance=5, heads-up garanti)  
**Priorité Android :** `HIGH` (obligatoire app fermée / écran éteint)  
**Payload obligatoire :** `notification: { title, body }` + `data: { type, entity_id, notif_route }`

---

## 🔒 MODULES VERROUILLÉS — NE PAS MODIFIER

### Notifications (FREEZE TOTAL)

| Fichier | Statut | Canal |
|---|---|---|
| `functions/sendCdlNotification` | 🔒 SOURCE UNIQUE | `cdl_critical_alerts_v2` |
| `functions/validateBedouRequest` | 🔒 VERROUILLÉ | via `sendCdlNotification` |
| `functions/notifyBedouEvents` | 🔒 VERROUILLÉ | via `sendCdlNotification` |
| `functions/submitBedouRecharge` | 🔒 VERROUILLÉ | FCM direct admins (synchrone) |
| `functions/notifyRetraitEvents` | 🔒 VERROUILLÉ | via `sendCdlNotification` |
| `functions/notifyCourseEvents` | 🔒 VERROUILLÉ | via `sendCdlNotification` |
| `functions/notifyNewCourse` | 🔒 VERROUILLÉ | via `sendCdlNotification` |
| `functions/notifyProfileEvents` | 🔒 VERROUILLÉ | via `sendCdlNotification` |
| `functions/notifyCommandeEvents` | 🔒 VERROUILLÉ | via `sendCdlNotification` |

**Règles absolues :**
- ❌ NE JAMAIS modifier `channel_id` — doit rester `cdl_critical_alerts_v2`
- ❌ NE JAMAIS supprimer `notification: { title, body }` du payload FCM
- ❌ NE JAMAIS changer `android.priority` — doit rester `HIGH`
- ❌ NE JAMAIS créer une fonction FCM parallèle — tout passe par `sendCdlNotification`
- ❌ NE JAMAIS utiliser `InvokeLLM` pour envoyer une notification
- ✅ Extensions autorisées par ajout uniquement — jamais par remplacement

### Bedou (FREEZE TOTAL)

| Fichier | Statut |
|---|---|
| `functions/bedouEngine` | 🔒 VERROUILLÉ — logique financière critique |
| `functions/validateBedouRequest` | 🔒 VERROUILLÉ — anti-double-crédit + ordre 1→6 |
| `functions/submitBedouRecharge` | 🔒 VERROUILLÉ — création demande + notif synchrone |
| `entities/DemandeRecharge` | 🔒 VERROUILLÉ — schéma financier |
| `entities/Bedou` | 🔒 VERROUILLÉ — wallet client |
| `entities/Transaction` | 🔒 VERROUILLÉ — historique immuable |

**Règles absolues :**
- ❌ NE JAMAIS modifier l'ordre des étapes dans `validateBedouRequest` (1→6)
- ❌ NE JAMAIS supprimer le guard anti-double-crédit (`statut !== 'en_attente'`)
- ❌ NE JAMAIS supprimer le log `[BEDOU_AUDIT]`
- ❌ NE JAMAIS hardcoder email, user_id ou wallet

---

## 🧪 GATE DE NON-RÉGRESSION OBLIGATOIRE

Avant toute future modification d'un module verrouillé, exécuter **OBLIGATOIREMENT** :

### Test global (5 en 1)
```
Fonction : testAllPushNotifications
Payload  : {}
```

### Test Bedou dédié
```
Fonction : realBedouRechargeTest
Payload  : {}
```

**Critères de succès (TOUS requis) :**
```
all_passed     = true
fcm_sent       > 0     (pour chaque test)
fcm_failed     = 0     (pour chaque test)
delay_ms       < 5000  (pour chaque test)
channel_id     = cdl_critical_alerts_v2
```

**Si UN critère échoue → rollback immédiat, NE PAS déployer l'APK.**

---

## 🚫 PÉRIMÈTRE GELÉ — ZÉRO MODIFICATION PARALLÈLE

Ces modules ne doivent PAS être modifiés pendant la stabilisation APK :

- `dispatch` / `autoDispatch` / `dispatchProgressif` / `selectSmartLivreurs`
- `UserProfile` / validation livreurs / profils
- Marketplace / commandes partenaire
- Firebase config (`firebaseConfig.js`, `firebase-messaging-sw.js`, `firebase-sw-config.js`)
- Android config (`capacitor.config.json`, `google-services.json`)
- UI globale (`AppLayout`, `AppLayoutWrapper`, `App.jsx` routes)

---

## 📋 CHECKLIST REBUILD APK PRODUCTION

- [ ] `testAllPushNotifications` → `all_passed: true` (5/5)
- [ ] `realBedouRechargeTest` → `passed: true`
- [ ] Token admin FCM actif en BDD (`is_active: true`, `device_type: android_native`)
- [ ] Canal `cdl_critical_alerts_v2` enregistré sur l'appareil test
- [ ] `google-services.json` présent dans `android/app/`
- [ ] `npx cap sync android` exécuté
- [ ] Build Android Studio → APK signé
- [ ] Test manuel : recharge → push admin reçu < 5s ✓
- [ ] Test manuel : validation admin → push client reçu ✓
- [ ] Test manuel : nouvelle course → push livreur reçu ✓
- [ ] Test manuel : nouveau profil → push admin reçu ✓

---

## 📌 MODULES AUTORISÉS À ÉVOLUER (hors freeze)

- Pages UI (dashboard, statistiques, formulaires)
- WhatsApp notifications (`triggerWhatsAppNotification` — canal séparé)
- Dispatch manuel (assignation admin — UI uniquement)
- Publicités / annonceurs
- Parrainage / referral

---

## 🔍 LOGS DE TRAÇABILITÉ OBLIGATOIRES

Chaque fonction notification doit émettre :
```
[NOTIF_SOURCE] <nom_fonction> | event=<type> | user=<email> | ...
[notifyCourseEvents] → sendCdlNotification | to=<email> | type=<type>
[sendCdlNotification] ━━━ DONE ━━━ | fcm_sent=N | fcm_failed=0 | delay_ms=XXX
```

---

*Document mis à jour le 2026-05-04 — CDL_STABLE_BEDOU_PUSH_V1*  
*Tests : 5/5 PASSED | Canal : cdl_critical_alerts_v2 | Délai max mesuré : 531ms*