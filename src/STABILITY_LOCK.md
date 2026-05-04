# 🔒 CDL_STABLE_BEDOU_PUSH_V2 — VERROUILLAGE RÉEL + GATE OBLIGATOIRE

**Version :** CDL_STABLE_BEDOU_PUSH_V2  
**Date freeze :** 2026-05-04  
**Statut :** 🔒 FREEZE RÉEL — GATE OBLIGATOIRE AVANT TOUTE MODIFICATION  

---

## 🚨 RÈGLE ABSOLUE — VERROUILLAGE RÉEL (pas théorique)

**Aucune correction n'est validée tant que :**
1. `verifyBedouStabilityGate` → `passed: true` (tous critères)
2. `testAllPushNotifications` → `all_passed: true` (5/5)
3. Un **vrai client différent de l'admin** crée une vraie recharge Bedou
4. L'admin reçoit **physiquement** le push sur Android (`notification_visible_confirmed = true`)

**Ne jamais dire "corrigé" tant que `notification_visible_confirmed` n'est pas confirmé manuellement.**

### Guards actifs dans le code
- `[STABILITY_LOCK_VIOLATION]` loggé automatiquement si :
  - `fcm_sent = 0` après push
  - `fcm_failed > 0` et `fcm_sent = 0`
  - Aucun token FCM admin actif en BDD
  - `FIREBASE_SERVICE_ACCOUNT_JSON` absent
- `[STABILITY_LOCK_PROOF]` loggé à chaque vraie recharge avec tous les champs de preuve

### Champs de preuve obligatoires (loggés à chaque recharge réelle)
```
request_id | client_email | admin_email | admin_token_actuel
sendCdlNotification_called=true | channel_id=cdl_critical_alerts_v2
fcm_sent=N | fcm_failed=0 | firebase_message_id | delay_ms
notification_visible_confirmed=REQUIRES_MANUAL_ANDROID_VERIFICATION
```

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

## 🏗️ ARCHITECTURE NOTIFICATIONS — SOURCE UNIQUE v4.0

**Règle absolue :** 100% des push CDL passent par `sendCdlNotification`.  
Aucune logique FCM directe n'est autorisée dans les fonctions métier.

### Champs obligatoires dans chaque payload `data` (v4.0)
```json
{
  "type": "event_type_snake_case",
  "entity_id": "id_de_l_entite",
  "entity_type": "NomEntite",
  "target_role": "admin|client|livreur|partenaire|commercial|annonceur",
  "deep_link": "/route-cible",
  "notif_route": "/route-cible"
}
```

### Log obligatoire [CDL_PUSH_SENT] (émis automatiquement par sendCdlNotification)
```
[CDL_PUSH_SENT] event_type | entity_type | entity_id | recipient_email
                token_used | channel_id | fcm_sent | fcm_failed | firebase_message_id
```

### Anti-doublon actif (60s)
Clé : `recipient_email + event_type + entity_id + title`
→ Aucun doublon push possible dans une fenêtre de 60 secondes.

### FCM_TOKEN_LOCK actif
→ 1 seul token par `user_email`, le plus récent sélectionné automatiquement.
→ Tokens UNREGISTERED supprimés automatiquement.
→ Doublons nettoyés avant chaque envoi.

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
| `functions/validateBedouRequest` | 🔒 VERROUILLÉ | via `sendCdlNotification` + `[STABILITY_LOCK_PROOF]` |
| `functions/notifyBedouEvents` | 🔒 VERROUILLÉ | via `sendCdlNotification` |
| `functions/submitBedouRecharge` | 🔒 VERROUILLÉ | FCM direct admins + `[STABILITY_LOCK_PROOF]` + guards `[STABILITY_LOCK_VIOLATION]` |
| `functions/verifyBedouStabilityGate` | 🔒 GATE OBLIGATOIRE | à lancer avant toute livraison |
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

Avant toute future modification d'un module verrouillé, exécuter **DANS CET ORDRE** :

### 1. Gate de stabilité principal (NOUVEAU — obligatoire)
```
Fonction : verifyBedouStabilityGate
Payload  : {}
Critère  : passed = true + tous les critères à true
```

### 2. Test global (5 en 1)
```
Fonction : testAllPushNotifications
Payload  : {}
Critère  : all_passed = true (5/5)
```

### 3. Test Bedou dédié
```
Fonction : realBedouRechargeTest
Payload  : {}
Critère  : passed = true
```

### 4. Test réel sur appareil physique (OBLIGATOIRE — ne peut pas être automatisé)
```
- Un compte client DIFFÉRENT de l'admin crée une vraie recharge Bedou
- L'admin reçoit le push sur Android (vérification visuelle)
- notification_visible_confirmed = true (confirmé manuellement)
```

**Critères de succès (TOUS requis) :**
```
verifyBedouStabilityGate.passed         = true
verifyBedouStabilityGate.fcm_sent       ≥ 1
verifyBedouStabilityGate.fcm_failed     = 0
verifyBedouStabilityGate.channel_id     = cdl_critical_alerts_v2
verifyBedouStabilityGate.firebase_message_id  présent
testAllPushNotifications.all_passed     = true
realBedouRechargeTest.passed            = true
notification_visible_confirmed          = true (manuel)
```

**Si UN critère échoue → rollback immédiat, NE PAS déployer l'APK.**

### Logs à vérifier obligatoirement
```
[STABILITY_LOCK_PROOF]   → présent dans chaque vraie recharge
[STABILITY_LOCK_VIOLATION] → absent = bon signe (présent = problème bloquant)
[STABILITY_GATE_PROOF]   → présent dans verifyBedouStabilityGate
```

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

### Gates automatiques (dans l'ordre)
- [ ] `verifyBedouStabilityGate` → `passed: true` + `firebase_message_id` présent
- [ ] `testAllPushNotifications` → `all_passed: true` (5/5)
- [ ] `realBedouRechargeTest` → `passed: true`
- [ ] Logs `[STABILITY_LOCK_PROOF]` présents — aucun `[STABILITY_LOCK_VIOLATION]`

### Infrastructure
- [ ] Token admin FCM actif en BDD (`is_active: true`, `device_type: android_native`)
- [ ] Canal `cdl_critical_alerts_v2` enregistré sur l'appareil test
- [ ] `google-services.json` présent dans `android/app/`
- [ ] `npx cap sync android` exécuté
- [ ] Build Android Studio → APK signé

### Test réel obligatoire (humain)
- [ ] Compte client DIFFÉRENT de l'admin crée une vraie recharge
- [ ] Log `[STABILITY_LOCK_PROOF]` confirmé avec `fcm_sent≥1` et `firebase_message_id`
- [ ] Push reçu visiblement sur Android admin < 5s → `notification_visible_confirmed = true`
- [ ] Test manuel : validation admin → push client reçu ✓
- [ ] Test manuel : nouvelle course → push livreur reçu ✓
- [ ] Test manuel : nouveau profil → push admin reçu ✓

### Règle de livraison
**Ne dire "corrigé" et ne livrer l'APK QUE SI les 4 gates + le test physique sont validés.**

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