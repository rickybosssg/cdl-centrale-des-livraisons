# 🔒 CDL NOTIFICATION SYSTEM — STABILITY LOCK

**Date de verrouillage : 2026-05-04**
**Statut : PRODUCTION STABLE**

---

## ✅ PREUVE DE FONCTIONNEMENT (vraie recharge 2026-05-04 11:54)

```
[RECHARGE] BDD OK: id=69f88901... | +579ms
[RECHARGE] admins: 1 (weezyh2@gmail.com) | tokens actifs total: 3
[RECHARGE] FCM cibles: 1 token(s) | emails: weezyh2@gmail.com
[RECHARGE] FCM done: sent=1 failed=0 | +1255ms ✅
[sendCdlNotification] fcm_sent=1 fcm_failed=0 | channel=cdl_critical_alerts_v2 ✅
```

---

## 🔒 MODULES VERROUILLÉS — NE JAMAIS MODIFIER

| Module | Raison |
|--------|--------|
| `functions/sendCdlNotification` | Canal unique, payload FCM v1 standard |
| `functions/notifyBedouEvents` | Déclencheurs validés en production |
| `functions/submitBedouRecharge` | FCM synchrone + notif BDD OK |
| `functions/validateBedouRequest` | Anti-doublon + FCM direct validé |
| `public/firebase-messaging-sw.js` | SW FCM background/killed |
| `lib/firebaseConfig.js` | Config Firebase production |
| `capacitor.config.json` | Config Capacitor Android |

---

## 🔒 CANAL FCM UNIQUE ET DÉFINITIF

```
channel_id = cdl_critical_alerts_v2
priority   = HIGH (obligatoire app fermée)
importance = 5    (heads-up garanti Android)
```

**INTERDICTIONS ABSOLUES :**
- ❌ Ne jamais changer `channel_id` vers `default`, `CDL_ALERTS_HIGH` ou autre
- ❌ Ne jamais supprimer `notification: { title, body }` (obligatoire background)
- ❌ Ne jamais changer `android.priority` → doit rester `HIGH`
- ❌ Ne jamais créer une 2ème fonction de notification parallèle

---

## 📋 TEST OBLIGATOIRE AVANT TOUTE LIVRAISON

### REAL_BEDOU_RECHARGE_PUSH_TEST

Avant de livrer toute modification, exécuter :

```
base44.functions.invoke('realBedouRechargeTest', {})
```

**Critères de succès (tous obligatoires) :**
- ✅ `demande_created: true`
- ✅ `notif_admin_created: true`
- ✅ `fcm_sent > 0`
- ✅ `fcm_failed = 0`
- ✅ `delay_ms < 5000`
- ✅ `channel_id = cdl_critical_alerts_v2`

**❌ Ne pas livrer si un seul critère échoue.**

---

## 🏗️ RÈGLES D'ISOLATION DES MODIFICATIONS FUTURES

Chaque modification doit être isolée dans son module :

| Zone | Fichiers autorisés | Impact notifications |
|------|--------------------|----------------------|
| Bedou UI | `pages/MonBedou`, `pages/GestionBedou`, `components/bedou/*` | ❌ Aucun |
| Dispatch | `functions/autoDispatch`, `pages/dispatcher/DispatchMonitor` | ❌ Aucun |
| UI général | `pages/*`, `components/*` | ❌ Aucun |
| Notifications | `functions/sendCdlNotification` uniquement | Après test REAL_BEDOU obligatoire |

---

## 🚦 FLUX NOTIFICATION BEDOU VÉRIFIÉ

```
Client → submitBedouRecharge
    └─► Crée DemandeRecharge en BDD
    └─► Envoie notif interne admin (BDD)
    └─► Envoie FCM direct admin (synchrone, < 1.5s)

Entity automation DemandeRecharge.create → notifyBedouEvents
    └─► sendCdlNotification (role=admin)
        └─► Crée notif BDD admin
        └─► Envoie FCM admin (channel=cdl_critical_alerts_v2)
```

**Double push = normal** : submitBedouRecharge ET notifyBedouEvents envoient tous les deux.
Le 2ème est géré par l'anti-doublon 60s côté BDD.