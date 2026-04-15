# Nettoyage Complet FCM Web — 2026-04-15

## ✅ Suppression effectuée

### Fichiers supprimés
- `public/firebase-messaging-sw.js` — Service Worker avec tentative d'initialisation Firebase
- `lib/firebaseConfig.js` — Fonction de chargement config depuis backend
- `lib/pushNotifications.js` — Module Firebase web complet
- `functions/getFirebaseConfig.js` — Endpoint backend pour config Firebase
- `functions/saveFcmToken.js` — Endpoint backend pour sauvegarder token
- `pages/FcmDiagnostic.jsx` — Page de diagnostic complet

### Fichiers modifiés (nettoyage)
- `components/NotificationPermissionRequest.jsx` 
  - ❌ Suppression : logique generateFcmToken() complète
  - ❌ Suppression : import getFirebaseConfig()
  - ❌ Suppression : invocation saveFcmToken() pour web
  - ✅ Garder : permission uniquement (pas de token)
  - ✅ Garder : APK native (Capacitor)

- `components/AppLayoutWrapper.jsx`
  - ❌ Suppression : import pushNotifications pour web
  - ❌ Suppression : registerFcmToken() pour web
  - ❌ Suppression : logique token web
  - ✅ Garder : APK Capacitor native

- `App.jsx`
  - ❌ Suppression : import FcmDiagnostic
  - ❌ Suppression : route /fcm-diagnostic

## 📊 État actuel

### Web (navigateur / PWA)
- ❌ FCM web : **DÉSACTIVÉ**
- ✅ Permission notifications : possible (via NotificationPermissionRequest)
- ❌ Token : pas généré
- ❌ Service Worker FCM : supprimé
- ✅ Message handler natif : attaché sur 'cdl_navigate'

### APK Android (Capacitor)
- ✅ FCM natif : ACTIF
- ✅ Token : généré via Capacitor
- ✅ Notifications : fonctionnelles
- ✅ Deep linking : opérationnel

## 🛠️ Prochaines étapes

Pour repartir de zéro, il faut :
1. Enregistrer un Service Worker minimal (sans Firebase)
2. Tester que le SW fonctionne en isolation
3. Créer une config Firebase propre depuis les secrets backend
4. Générer le token FCM step-by-step
5. Tester l'envoi de notification réelle

**État : ✅ PRÊT POUR RECRÉATION**