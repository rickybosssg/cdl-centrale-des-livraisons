# 🔒 Android Native FCM Requirements — Deep Fix

## Manifest Permissions

**MUST have in `AndroidManifest.xml`**:

```xml
<!-- Notification permission (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Network -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- FCM Background service -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

## google-services.json

**MUST exist in `android/app/`**:

- Downloaded from Firebase Console
- Contains: `project_id`, `firebase_database_url`, `api_key`, `client_id`, `sender_id`
- Triggers `google-services` Gradle plugin in `build.gradle`

## capacitor.config.json

**PushNotifications plugin config**:

```json
{
  "plugins": {
    "PushNotifications": {
      "presentationOptions": ["badge", "sound", "alert"]
    }
  }
}
```

## Firebase Setup

1. Project must enable Cloud Messaging service
2. Admin SDK key for backend `sendCdlNotification` (set in `FIREBASE_SERVICE_ACCOUNT_JSON`)
3. Android app registered with package name = `com.cdl.app`

## Capacitor Init Flow (NativePush.js)

1. `PushNotifications.addListener('registration')` — MUST be called BEFORE `register()`
2. `PushNotifications.register()` — triggers 'registration' callback with token
3. Token saved via `FcmTokenEngine.saveToken()` → stored in BDD with `is_active: true`
4. If Firebase says UNREGISTERED → auto-mark `is_active: false`, force re-register

## Channel Setup

**Android 8.0+ (API 26+) requires notification channels**:

```
Channel ID: cdl_critical_alerts_v3 (LOCKED)
Importance: 5 (IMPORTANCE_MAX)
Sound: default
Vibration: true
Lights: true (RGB #FF6B1E)
Visibility: PUBLIC (visible on lock screen)
```

Auto-created in `nativePush.js:ensureChannel()`

## Push Payload Requirements

**sendCdlNotification** must set:

```json
{
  "message": {
    "notification": {
      "title": "...",
      "body": "..."
    },
    "data": {
      "channel_id": "cdl_critical_alerts_v3",
      "type": "...",
      "notif_route": "...",
      ...
    },
    "android": {
      "priority": "HIGH",
      "notification": {
        "channel_id": "cdl_critical_alerts_v3",
        "sound": "default",
        "visibility": "PUBLIC",
        "notification_priority": "PRIORITY_MAX"
      }
    }
  }
}
```

## Flow Guarantees

### Boot Sequence (FcmBootstrap + initCapacitorPush)

1. Check native context (`isNativeApp()`)
2. Check Android permission (`checkPermissions()`)
3. Request if needed (`requestPermissions()`)
4. Create channel (`ensureChannel()`)
5. Attach listeners (`addListener('registration')`, etc.)
6. Call `register()` → Firebase triggers callback
7. Token received → save to BDD
8. Verify BDD → mark `FcmReady=true`
9. If fails after 20s timeout → force recovery

### At App Resume / Foreground

1. Check active token in BDD
2. If missing/expired → force `register()` again
3. If still fails → auto-repair via `FcmTokenEngine.repair()`

### Error Handling

**If Firebase returns UNREGISTERED (HTTP 404)**:
- Immediately mark token `is_active: false`
- Log: `[FCM_SEND_RESULT] ❌ TOKEN_FATAL_ERROR → désactivation`
- Force re-register on next app start

## Diagnostic Pages

- `/fcm-native-debug` — Complete native stack diagnosis
  - Permission status
  - register() called yes/no
  - registration event received yes/no
  - Native token (masked)
  - BDD token yes/no
  - Last Firebase message ID
  - Last UNREGISTERED error

- `/system-health` — Overall system health
  - FCM engine status
  - RealtimeSync status
  - Bedou engine status

## Testing

1. **Force Register**: `/fcm-native-debug` → Force Register button
2. **Send Test Push**: Send Test Push button → should receive notification
3. **Check Logs**: Logcat console in Android Studio for `[FCM_*]` tags

## Android Build

```bash
# Generate APK with release config
npx cap build android --prod

# Sign APK for Play Store
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore mykey.jks app-release-unsigned.apk myalias
```

Verify:
- `POST_NOTIFICATIONS` permission in merged manifest
- Channel `cdl_critical_alerts_v3` created at runtime
- google-services.json present in build