# 🚀 CDL — CHECKLIST REBUILD APK FINAL STABLE
Date : 2026-05-13 | État : ARCHITECTURE GELÉE ✅

---

## ⚠️ RÈGLES ABSOLUES AVANT REBUILD

- NE PAS modifier : FCM, FcmBootstrap, sendCdlNotification, BedouEngine, DispatchEngine, ProfileEngine, RealtimeSyncEngine
- NE PAS changer le canal FCM : `cdl_critical_alerts_v3`
- NE PAS changer l'appId : `com.cdl.app`
- `webContentsDebuggingEnabled` = **false** (production) ✅ déjà fait

---

## ÉTAPE 1 — Préparer l'environnement local

```bash
# Aller dans le dossier du projet
cd /ton/projet/cdl

# Installer les dépendances si besoin
npm install

# Build de production
npm run build
```

---

## ÉTAPE 2 — Synchroniser Capacitor

```bash
# Sync web → Android (OBLIGATOIRE après chaque build)
npx cap sync android

# Ouvrir Android Studio (pour la signature)
npx cap open android
```

---

## ÉTAPE 3 — Android Studio : Paramètres de build production

Dans Android Studio :

1. **Build > Generate Signed Bundle / APK**
2. Choisir **APK** (pas App Bundle pour test terrain)
3. Sélectionner le keystore existant (ne jamais en créer un nouveau)
4. Build variant : **release**
5. **Build > Build APK**

> ⚠️ Si tu n'as pas le keystore : utiliser `debug` uniquement pour le test initial FCM.

---

## ÉTAPE 4 — Vérifications avant installation

Vérifier dans `android/app/src/main/AndroidManifest.xml` :
- [ ] `com.google.firebase.messaging.default_notification_channel_id` = `cdl_critical_alerts_v3`
- [ ] Permissions : `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `POST_NOTIFICATIONS`
- [ ] `android:exported="true"` sur le service FCM

Vérifier dans `android/app/google-services.json` :
- [ ] `project_id` = `cdl-app-4743c`
- [ ] `package_name` = `com.cdl.app`

---

## ÉTAPE 5 — Installation sur le téléphone

```bash
# Désinstaller l'ancienne APK d'abord (important pour token FCM propre)
adb uninstall com.cdl.app

# Installer la nouvelle APK
adb install -r app-release.apk
# OU
adb install app-debug.apk
```

**OU** manuellement :
1. Copier l'APK sur le téléphone
2. Désinstaller l'ancienne version
3. Installer la nouvelle

---

## ÉTAPE 6 — Premier lancement (génération token FCM propre)

1. Ouvrir l'app
2. Accepter les permissions notifications quand demandé
3. Se connecter avec le compte admin (weezyh2@gmail.com)
4. Attendre 5-10 secondes → FcmBootstrap enregistre automatiquement le token
5. Vérifier dans `/fcm-native-debug` que le token est enregistré

---

## ÉTAPE 7 — Tests terrain à effectuer dans l'ordre

### 🔔 FCM (priorité 1)
- [ ] Envoyer une notification test depuis `/test-notifications`
- [ ] Réception app ouverte ✓
- [ ] Réception app arrière-plan ✓
- [ ] Réception app fermée ✓
- [ ] Réception écran verrouillé ✓
- [ ] Vibration + son présents ✓

### ⚡ Dispatch (priorité 2)
- [ ] Créer une course test depuis un compte client
- [ ] Vérifier notification push reçue sur le téléphone livreur
- [ ] Accepter la course dans les 60s
- [ ] Tester refus → réassignation automatique
- [ ] Tester timeout 60s → réassignation

### 👤 Profils (priorité 3)
- [ ] Changer profil client → livreur → commercial → partenaire
- [ ] Vérifier que `driver_online` s'active/désactive correctement
- [ ] Tester avec 2 profils simultanés sur 2 téléphones

### 💳 Settlement Bedou (priorité 4)
- [ ] Livrer une course complète
- [ ] Vérifier débit client sur `/mon-bedou`
- [ ] Vérifier crédit livreur (80%)
- [ ] Vérifier commission CDL (20%) dans `/admin/financial-dashboard`
- [ ] Vérifier `CourseSettlementLog` dans `/admin/logs`

### 💰 Recharge Bedou (priorité 5)
- [ ] Soumettre une recharge depuis un compte client
- [ ] Vérifier notification push admin
- [ ] Valider depuis l'admin
- [ ] Vérifier solde mis à jour sur client (auto-refresh < 3s)

---

## ✅ CRITÈRES DE VALIDATION FINALE

Tous ces points doivent être ✅ avant publication Play Store :

| Critère | Attendu |
|---|---|
| Token FCM généré au 1er lancement | Dans FcmToken BDD, `is_active=true` |
| Push app fermée | Reçu sur écran verrouillé |
| Dispatch 60s | Course réassignée après timeout |
| Settlement | `settlement_status=completed` dans Course |
| Bedou solde | Auto-refresh < 3s après validation |
| Changement profil | `driver_online` correct immédiatement |
| Aucun spinner infini | Max 8s puis fallback |
| Aucun crash APK | Aucune fermeture inattendue sur 30min |

---

## 🔒 MODULES GELÉS — NE PAS TOUCHER

```
FcmBootstrap.jsx
FcmTokenEngine.js
sendCdlNotification (function)
BedouEngine.js (lib)
DispatchEngine.js (lib)
ProfileEngine.js (lib)
RealtimeSyncEngine.js (lib)
CourseStatusEngine.js (lib)
hooks/useSafeAsync.js
Canal FCM : cdl_critical_alerts_v3
```

---

## 📋 COMMANDES RAPIDES

```bash
# Build + sync complet en une commande
npm run build && npx cap sync android

# Logcat pour debug FCM en temps réel
adb logcat | grep -E "FCM|CDL|Capacitor|Firebase"

# Voir les logs spécifiques CDL
adb logcat -s CDL:V Firebase:V
``