# 🔒 CDL_STABLE_BEDOU_PUSH_V1 — STABILITY LOCK

**Version :** CDL_STABLE_BEDOU_PUSH_V1  
**Date freeze :** 2026-05-04  
**Statut :** ✅ PRODUCTION STABLE — PRÊT POUR REBUILD APK  

---

## ✅ CERTIFICATION DE NON-RÉGRESSION

```
REAL_BEDOU_RECHARGE_PUSH_TEST — PASSED
────────────────────────────────────────
timestamp     : 2026-05-04T12:44:58.516Z
admin_email   : weezyh2@gmail.com
delay_ms      : 2582ms (< 5000ms ✅)
fcm_sent      : 1
fcm_failed    : 0
channel_id    : cdl_critical_alerts_v2 ✅
demande_créée : ✅
notif_admin   : ✅
cleanup       : ✅
msgId FCM     : projects/cdl-app-4743c/messages/0:1777898699543326%...
```

---

## 🔒 MODULES VERROUILLÉS — NE PAS MODIFIER

### Notifications (FREEZE TOTAL)

| Fichier | Statut | Raison |
|---|---|---|
| `functions/sendCdlNotification` | 🔒 VERROUILLÉ | Source unique FCM — toute modif casse le canal |
| `functions/validateBedouRequest` | 🔒 VERROUILLÉ | Utilise sendCdlNotification — testé en prod |
| `functions/notifyBedouEvents` | 🔒 VERROUILLÉ | Délégation sendCdlNotification — doublon évité |
| `functions/submitBedouRecharge` | 🔒 VERROUILLÉ | FCM admin direct + retry 1x — validé |

**Règles absolues :**
- ❌ NE JAMAIS modifier `channel_id` — doit rester `cdl_critical_alerts_v2`
- ❌ NE JAMAIS supprimer `notification: { title, body }` du payload FCM
- ❌ NE JAMAIS changer `android.priority` — doit rester `HIGH`
- ❌ NE JAMAIS créer une fonction FCM parallèle — tout passe par `sendCdlNotification`
- ❌ NE JAMAIS supprimer le retry 1x dans `validateBedouRequest` / `submitBedouRecharge`
- ✅ Extensions autorisées par ajout uniquement — jamais par remplacement

### Bedou (FREEZE TOTAL)

| Fichier | Statut | Raison |
|---|---|---|
| `functions/bedouEngine` | 🔒 VERROUILLÉ | Crédit/débit client — logique financière critique |
| `functions/validateBedouRequest` | 🔒 VERROUILLÉ | Anti-double-crédit + ordre étapes 1→6 |
| `functions/submitBedouRecharge` | 🔒 VERROUILLÉ | Création demande + notif admin synchrone |
| `entities/DemandeRecharge` | 🔒 VERROUILLÉ | Schéma financier — ne pas supprimer de champs |
| `entities/Bedou` | 🔒 VERROUILLÉ | Wallet client — ne pas modifier les champs solde |
| `entities/Transaction` | 🔒 VERROUILLÉ | Historique immuable |

**Règles absolues :**
- ❌ NE JAMAIS modifier l'ordre des étapes dans `validateBedouRequest` (1→6)
- ❌ NE JAMAIS supprimer l'anti-double-crédit (guard `statut !== 'en_attente'`)
- ❌ NE JAMAIS supprimer le log `[BEDOU_AUDIT]`
- ❌ NE JAMAIS hardcoder email, user_id ou wallet dans les fonctions Bedou

---

## 🏗️ ARCHITECTURE NOTIFICATIONS (ÉTAT STABLE)

```
Événement                    Fonction source              Canal FCM
─────────────────────────────────────────────────────────────────────
Nouvelle recharge client  →  submitBedouRecharge      →  cdl_critical_alerts_v2 (admins)
Validation admin          →  validateBedouRequest     →  sendCdlNotification → cdl_critical_alerts_v2 (client)
Refus admin               →  validateBedouRequest     →  sendCdlNotification → cdl_critical_alerts_v2 (client)
Automation BDD            →  notifyBedouEvents        →  sendCdlNotification (create uniquement)
Toutes autres notifs      →  sendCdlNotification      →  cdl_critical_alerts_v2
```

**Règle d'or :** `notifyBedouEvents` NE renvoie PAS les cas `valide`/`refuse` (géré par `validateBedouRequest`).

---

## 🧪 GATE DE NON-RÉGRESSION OBLIGATOIRE

Avant toute future modification des modules ci-dessus, exécuter **OBLIGATOIREMENT** :

```bash
# Via dashboard Base44 → Code → Functions → realBedouRechargeTest → Test
# Payload : {}
```

**Critères de succès (tous requis) :**
- `passed: true`
- `fcm_sent > 0`
- `fcm_failed = 0`
- `channel_id = cdl_critical_alerts_v2`
- `delay_ms < 5000`
- `demande_created: true`
- `notif_admin_created: true`

**Si UN critère échoue → rollback immédiat, ne pas déployer l'APK.**

---

## 🚫 PÉRIMÈTRE GELÉ — ZÉRO MODIFICATION PARALLÈLE

Les modules suivants ne doivent PAS être modifiés pendant la période de stabilisation APK :

- `dispatch` / `autoDispatch` / `dispatchProgressif`
- `UserProfile` / validation livreurs / profils
- Marketplace / commandes partenaire
- Firebase config (`firebaseConfig.js`, `firebase-messaging-sw.js`)
- Android config (`capacitor.config.json`, `google-services.json`)
- UI globale (`AppLayout`, `AppLayoutWrapper`, `App.jsx` routes)

---

## 📋 CHECKLIST REBUILD APK

Avant de générer l'APK production :

- [ ] `realBedouRechargeTest` → PASSED
- [ ] Token admin FCM actif en BDD (`is_active: true`)
- [ ] `channel_id = cdl_critical_alerts_v2` créé sur l'appareil test
- [ ] `google-services.json` présent dans `android/app/`
- [ ] `npx cap sync android` exécuté
- [ ] Build Android Studio → APK signé
- [ ] Test manuel : recharge → push admin reçu < 5s
- [ ] Test manuel : validation admin → push client reçu

---

## 📌 MODULES AUTORISÉS À ÉVOLUER (hors freeze)

Ces modules peuvent être modifiés sans risque pour la stabilité Bedou/Push :

- Pages UI (dashboard, profils, statistiques)
- WhatsApp notifications (`triggerWhatsAppNotification`)
- Dispatch manuel (assignation admin)
- Publicités / annonceurs
- Parrainage / referral

---

*Document généré automatiquement le 2026-05-04 — CDL_STABLE_BEDOU_PUSH_V1*