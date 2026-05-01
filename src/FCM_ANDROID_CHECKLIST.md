# FCM Android Crash Fix — Checklist Complète

**Date:** 2026-05-01  
**Status:** 🔴 URGENT — Crash WebView + FCM non fonctionnel

---

## CORRECTIONS APPLIQUÉES

### 1. ✅ `PermissionsOnboarding` — Protection crash `requestPermissions()`
- ✅ Wrapped `requestPermissions()` dans try/catch robuste
- ✅ Ajouté timeout 8s sur le dialog Android
- ✅ Re-check permission après timeout
- ✅ Global timeout 10s pour éviter blocage app

### 2. ✅ `FcmBootstrap` — Meilleur logging + error handling
- ✅ Improved token logging (type validation, length)
- ✅ Detailed email resolution logging
- ✅ DB save result logging

---

## VÉRIFICATIONS À FAIRE SUR LE TÉLÉPHONE/ANDROID STUDIO

### A. AndroidManifest.xml
```xml
<!-- ✅ DOIT EXISTER -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.INTERNET" />
```

**Emplacement:** `android/app/src/AndroidManifest.xml`

---

### B. google-services.json

**Emplacement:** `android/app/google-services.json`

```json
{
  "project_info": {
    "project_number": "YOUR_PROJECT_NUMBER",
    "firebase_url": "https://YOUR_PROJECT.firebaseio.com",
    "project_id": "YOUR_PROJECT_ID",
    "storage_bucket": "YOUR_PROJECT.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:YOUR_APP_ID:android:YOUR_SHA_HASH",
        "android_client_info": {
          "package_name": "com.cdl.app",  // ✅ DOIT MATCH le package APK
          "certificate_hash": [...],
          "certificate_hash_type": "SHA_1"
        }
      },
      "oauth_client": [...],
      "api_key": [...],
      "services": {
        "appinvite_service": {...},
        "google_app_id": "1:YOUR_APP_ID:android:YOUR_SHA_HASH",
        "google_analytics_service": {...},
        "ads_service": {...}
      }
    }
  ]
}
```

**Actions:**
- [ ] Vérifier `package_name` = `com.cdl.app`
- [ ] Vérifier `mobilesdk_app_id` contient le SHA-1 du keystore
- [ ] Vérifier SHA-1 en exécutant:
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
  ```
- [ ] Si SHA-1 ne match pas → Régénérer google-services.json depuis Firebase Console

---

### C. build.gradle (Android App)

**Emplacement:** `android/app/build.gradle`

```gradle
// ✅ DOIT EXISTER en bas du fichier
apply plugin: 'com.google.gms.google-services'

android {
    compileSdkVersion 33  // ou 34, 35 minimum
    
    defaultConfig {
        applicationId = "com.cdl.app"  // ✅ DOIT MATCH google-services.json
        minSdkVersion 23
        targetSdkVersion 33  // Android 13+
        ...
    }
}

dependencies {
    // ✅ Firebase (si pas déjà présent)
    implementation platform('com.google.firebase:firebase-bom:32.8.1')
    implementation 'com.google.firebase:firebase-messaging'
    
    // ✅ Capacitor Push Notifications
    implementation 'com.capacitor:core:5.x.x'
    implementation 'com.capacitor.plugins:push-notifications:5.x.x'
}
```

**Actions:**
- [ ] Vérifier `apply plugin: 'com.google.gms.google-services'` présent
- [ ] Vérifier Firebase BOM version = 32.8.1 minimum

---

### D. build.gradle (Project Root)

**Emplacement:** `android/build.gradle`

```gradle
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        // ✅ DOIT EXISTER
        classpath 'com.google.gms:google-services:4.4.0'  // ou plus récent
    }
}
```

**Actions:**
- [ ] Vérifier google-services classpath présent
- [ ] Vérifier version >= 4.4.0

---

### E. CapacitorConfig

**Emplacement:** `capacitor.config.json`

```json
{
  "appId": "com.cdl.app",  // ✅ DOIT MATCH
  "appName": "CDL",
  ...
}
```

**Actions:**
- [ ] Vérifier appId = `com.cdl.app`

---

### F. Logcat — Vérifier logs natifs

**Commande:**
```bash
adb logcat -s "PushNotifications:*" "FirebaseMessaging:*" "AndroidRuntime:E" "WEB"
```

**À chercher:**

#### ✅ Bon
```
[PushNotifications] registration token: abc123def456...
[FCM] ✅ token received: abc123def456...
[FCM] ✅ token saved to DB
```

#### 🔴 Mauvais
```
[FirebaseMessaging] Failed to retrieve registration token: ...
[AndroidRuntime] FATAL EXCEPTION: ... WebView crash ...
[PushNotifications] registrationError: InvalidData
```

---

### G. Firebase Console — Vérifier config serveur

1. Aller sur https://console.firebase.google.com
2. Sélectionner le projet CDL
3. **Project Settings → Android apps**
   - [ ] Package name = `com.cdl.app`
   - [ ] SHA-1 certificate = SHA du keystore
   - [ ] Status = "✅ Connected"

4. **Cloud Messaging (Messages API)**
   - [ ] Service account créé
   - [ ] Credentials (JSON) downloadé

---

### H. Rebuild APK

```bash
# Nettoyer
cd android && ./gradlew clean && cd ..

# Rebuild
npx cap sync android
npx cap open android

# Depuis Android Studio:
# 1. Run → Edit Configurations
# 2. Build → Build Bundle(s) / APK(s) → Build APK(s)
# 3. Attendre build complete
# 4. Run sur device
```

---

## Logs Attendus Après Fix

**Console React:**
```
[PERMISSIONS] notification request start (Android native)
[PERMISSIONS] checkPermissions result: prompt
[PERMISSIONS] requestPermissions() avec timeout de sécurité...
[PERMISSIONS] requestPermissions completed: granted
[FCM] scheduled (delay 45 s
[FCM] bootstrap start
[FCM] plugin loaded
[FCM] permission status: granted
[FCM] listeners attached: 4
[FCM] register() call
[FCM] register() OK — waiting for token callback...
[FCM] ✅ token received: abc123def456... (length: 152)
[FCM] email resolved: user@example.com
[FCM] ✅ token saved to DB: SUCCESS
```

**Logcat Android:**
```
[PushNotifications] addListener: registration
[FirebaseMessaging] token: abc123def456...
[WEB] [FCM] token saved | action: insert
```

---

## Troubleshooting

| Symptôme | Cause | Fix |
|----------|-------|-----|
| App crash après "Demander permission" | Dialog Android crash WebView | ✅ Wrapped dans try/catch + timeout |
| Aucun token en base | Permission non accordée | Vérifier AndroidManifest.xml |
| Token vide/null | Firebase config manquante | Vérifier google-services.json + SHA-1 |
| "registrationError: InvalidData" | Package name mismatch | Vérifier `com.cdl.app` partout |
| App continue après crash | Timeout protège | Normal — FCM relancera au prochain boot |

---

## Next Steps

1. **Vérifier la config Android** (checklist A-H)
2. **Rebuild APK** avec Android Studio
3. **Test sur device:**
   - Lancer app
   - Cliquer "Demander permission"
   - Accepter notifications
   - Ouvrir Logcat → vérifier token reçu
4. **Vérifier BDD:** FcmToken.filter({ user_email: "YOUR_EMAIL" })
5. **Envoyer test notification** via FcmDiagnostic page

---

## Contacts / Support

- Firebase: https://console.firebase.google.com
- Capacitor Push: https://capacitorjs.com/docs/apis/push-notifications
- Android 13+ Notifications: https://developer.android.com/develop/ui/views/notifications/notification-permission

---

**Status:** 🟡 PRÊT AU TEST  
**Last Updated:** 2026-05-01 — v6