# 🔐 FCM Android — Correction Finale (Token + Notification)

## 🎯 Problème

Test Firebase Console → 0 notification sur APK Android. Token est généré mais :
- Doublons/anciens tokens en BDD
- Pas de channel Android "default" avec importance HIGH
- Listeners manquants ou pas attachés
- Permission POST_NOTIFICATIONS (Android 13+) pas vérifiée
- Logs insuffisants pour diagnostiquer

---

## ✅ Corrections Appliquées

### 1️⃣ **Nettoyage Automatique des Tokens** (Backend)

**Fonction :** `cleanupAndRegisterFcmToken` 
- ✅ À chaque démarrage app, récupère le token FCM actuel
- ✅ Supprime les anciens tokens du même user_id + device_id
- ✅ Enregistre UNIQUEMENT le dernier token valide
- ✅ Retourne le statut (créé, mis à jour, nettoyé)

**Usage :**
```javascript
const res = await base44.functions.invoke('cleanupAndRegisterFcmToken', {
  token: "token_from_firebase",
  device_type: "android_native",
  device_id: "device_id"
});
```

### 2️⃣ **FcmBootstrap Amélioré** (Frontend)

**Améliorations :**
- ✅ **Channel Android** : Création avec `importance=5` (HIGH) — obligatoire
- ✅ **Listeners Complets** : 4 listeners attachés avant `register()`
  - `registration` → Token reçu
  - `registrationError` → Erreur Firebase
  - `pushNotificationReceived` → Notification au foreground
  - `pushNotificationActionPerformed` → Tap sur notification
- ✅ **Logs Détaillés** :
  - Token reçu (longueur, premiers 50 chars)
  - Device ID extrait
  - Permission vérifiée
  - Chaque listener confirmé
- ✅ **Timeout Stricts** : max 20s pour `register()`, callback stocké en sessionStorage si erreur

### 3️⃣ **Page de Diagnostic + Rafraîchissement** (Frontend)

**Route :** `/fcm-token-refresh`

**Fonctionnalités :**
- ✅ Affiche token actuel (avec bouton Copier)
- ✅ Affiche permission Android et Device ID
- ✅ **Bouton "Force Refresh Token"** : Force registration manuelle
  - Appelle `register()` avec timeout 15s
  - Enregistre automatiquement via `cleanupAndRegisterFcmToken`
  - Affiche logs en temps réel
- ✅ Checklist visuelle : Plateforme ✓ | Permission ✓ | Token ✓

**Accès :** Settings → 🔑 Gérer Token FCM

### 4️⃣ **Fonction Récupération Token Actuel** (Backend)

**Fonction :** `getCurrentFcmToken`
- Cherche le token le plus récent et actif pour l'user
- Retourne : token, token_id, device_type, last_used, all_tokens_count

---

## 🔧 Étapes pour Tester

### A. Vérifier Token en BDD

1. Settings → **🔑 Gérer Token FCM**
2. Vérifier :
   - ✅ Platform : "Android Native (Capacitor)"
   - ✅ Permission : "granted"
   - ✅ Token : Affiché (si aucun → cliquer "Force Refresh Token")
   - ✅ Device ID : Visible

### B. Forcer Refresh Token (Si aucun token)

1. Settings → **🔑 Gérer Token FCM**
2. Cliquer **"Force Refresh Token"**
3. Regarder les logs en temps réel :
   - `✅ registration callback: token received` ← Token reçu de Firebase
   - `✅ Token registered: abc123...` ← Enregistré en BDD
   - `✅ Refresh COMPLETE` ← Succès

### C. Tester Envoi Firebase Console

1. **Firebase Console** → Project CDL → Cloud Messaging
2. **Send your first message**
3. Title : "Test CDL"
4. Select platforms : **Android**
5. Target : **Topic ou User segment**
6. Send → APK reçoit la notification ✅

---

## 📊 Vérifier que Tout Marche

### Checklist Complète

- [ ] APK lancée → PermissionsOnboarding affiche demande permission
- [ ] Permission accordée → Notification channel créé
- [ ] Settings → 🔑 Gérer Token FCM → Token affiché ✅
- [ ] Firebase Console → Envoi test → Notification reçue (app fermée) ✅
- [ ] Firebase Console → Envoi test → Notification reçue (app background) ✅
- [ ] Firebase Console → Envoi test → Notification reçue (app foreground) ✅

### Si Aucune Notification

1. Vérifier en `/fcm-token-refresh` :
   - Token affiché ? (Si non → Force Refresh)
   - Permission = "granted" ? (Si non → PermissionsOnboarding)
   - Device ID visible ?

2. Vérifier dans Firebase Console :
   - Target = User (segmentation) ou Topic ?
   - Sélectionné Android Platform ?
   - Pas d'erreur lors de "Send" ?

3. Vérifier Logs (Chrome DevTools) :
   - `[FCM] ✅ Plugin loaded` ?
   - `[FCM] ✅ Channel created with importance=5 (HIGH)` ?
   - `[FCM] ✅ Listener "registration" attached` ?
   - `[FCM] ✅ registration callback fired` ?

---

## 🚀 Après Correction

**Le flux complet doit être :**

```
App Start
  ↓
FcmBootstrap.runNativeFcm()
  ↓
✅ Plugin loaded
✅ Channel created (importance=5)
✅ Permission checked (granted)
✅ All listeners attached
  ↓
PushNotifications.register()
  ↓
Firebase → registration callback → Token received
  ↓
handleTokenReceived()
  ↓
cleanupAndRegisterFcmToken() → Token saved in DB
  ↓
Firebase Console → Send message
  ↓
APK → pushNotificationReceived (foreground)
      or system notification (background)
      or tap notification → handleNotifTap()
```

---

## 📋 Fichiers Modifiés

| Fichier | Modification |
|---------|--------------|
| `components/FcmBootstrap` | ✅ Logs détaillés + Channel HIGH + Listeners complets |
| `functions/cleanupAndRegisterFcmToken` | ✅ Nouveau — Nettoie + enregistre tokens |
| `functions/getCurrentFcmToken` | ✅ Nouveau — Récupère token actuel |
| `pages/FcmTokenRefresh` | ✅ Nouveau — UI diagnostic + Force Refresh |
| `pages/Settings` | ✅ Link vers 🔑 Gérer Token FCM |
| `App.jsx` | ✅ Route `/fcm-token-refresh` |

---

## 🆘 Erreurs Courantes

| Symptôme | Cause | Solution |
|----------|-------|----------|
| Aucun token dans 🔑 Gérer Token FCM | Permission pas donnée | PermissionsOnboarding → Accorder permission |
| Permission = "denied" | Utilisateur a refusé | Paramètres Android → CDL → Notifications ON |
| Notification test → pas reçue (closed app) | Channel pas HIGH importance | Force Refresh Token → Vérifier logs |
| Logs vides dans 🔑 Gérer Token FCM | registrationError silencieux | Vérifier Google Cloud permissions (403) |
| Token change à chaque démarrage | Anciens tokens pas supprimés | cleanupAndRegisterFcmToken devrait les supprimer |

---

## 🔍 Debug Avancé

**Si ça continue à échouer :**

1. **Chrome DevTools** → Onglet Console → Chercher `[FCM]` logs
2. **Firebase Console** → Cloud Messaging → Voir historique envois
3. **Google Cloud** → Logs Deno → Vérifier `sendFcmNotification` errors
4. **logcat Android** (adb) :
   ```bash
   adb logcat -s FirebaseMessaging:* AndroidRuntime:E
   ```

---

**Une fois les corrections appliquées, les notifications Firebase doivent fonctionner correctement sur app fermée, background, et foreground.**