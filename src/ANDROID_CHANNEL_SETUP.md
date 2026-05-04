# 🔴 ANDROID — CONFIGURATION OBLIGATOIRE POUR LES NOTIFICATIONS

## Problème
FCM envoie (fcm_sent=1, msgId OK) mais les notifications n'apparaissent pas sur Android.

**Cause racine** : Le channel `cdl_critical_alerts_v2` n'existe pas sur l'appareil.
Android ignore toute notification destinée à un channel inexistant.

---

## ✅ Fix 1 — MainActivity.java (OBLIGATOIRE)

Remplacez le contenu de `android/app/src/main/java/com/cdl/app/MainActivity.java` :

```java
package com.cdl.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

            // 🔒 CANAL PRINCIPAL VERROUILLÉ — cdl_critical_alerts_v2
            // Ne jamais changer l'ID — importance IMPORTANCE_HIGH = heads-up garanti
            NotificationChannel criticalChannel = new NotificationChannel(
                "cdl_critical_alerts_v2",
                "CDL Alertes Critiques",
                NotificationManager.IMPORTANCE_HIGH
            );
            criticalChannel.setDescription("Courses, recharges Bedou, profils — priorité maximale");
            criticalChannel.enableLights(true);
            criticalChannel.setLightColor(0xFFFF6B1E); // Orange CDL
            criticalChannel.enableVibration(true);
            criticalChannel.setVibrationPattern(new long[]{0, 250, 250, 250});
            criticalChannel.setShowBadge(true);

            // Son par défaut
            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .build();
            criticalChannel.setSound(
                Uri.parse("content://settings/system/notification_sound"),
                audioAttributes
            );

            notificationManager.createNotificationChannel(criticalChannel);

            // Canal secondaire pour notifications normales
            NotificationChannel defaultChannel = new NotificationChannel(
                "default",
                "CDL Notifications",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            defaultChannel.setDescription("Notifications générales CDL");
            notificationManager.createNotificationChannel(defaultChannel);

            android.util.Log.d("CDL_FCM", "✅ Notification channels créés: cdl_critical_alerts_v2 (IMPORTANCE_HIGH) + default");
        }
    }
}
```

---

## ✅ Fix 2 — AndroidManifest.xml

Dans `android/app/src/main/AndroidManifest.xml`, ajoutez dans `<manifest>` (avant `<application>`) :

```xml
<!-- Android 13+ : permission obligatoire pour recevoir les push -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.VIBRATE"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
```

Et dans `<application>` (avec les autres `<meta-data>`) :

```xml
<!-- Canal par défaut FCM — DOIT correspondre au canal créé dans MainActivity -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="cdl_critical_alerts_v2" />

<!-- Icône de notification (blanc sur fond transparent recommandé) -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_icon"
    android:resource="@mipmap/ic_launcher" />

<!-- Couleur accent notification -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_color"
    android:resource="@color/colorPrimary" />
```

---

## ✅ Fix 3 — Vérifier le service FCM dans AndroidManifest.xml

Dans `<application>`, vérifiez la présence du service Firebase :

```xml
<service
    android:name="com.google.firebase.messaging.FirebaseMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT"/>
    </intent-filter>
</service>
```

> ⚠️ Capacitor l'ajoute automatiquement via le plugin @capacitor/push-notifications.
> Si absent, exécutez `npx cap sync android` puis vérifiez.

---

## ✅ Fix 4 — Payload FCM (déjà correct côté serveur)

Le payload envoyé par `sendCdlNotification` est :

```json
{
  "message": {
    "token": "...",
    "notification": {
      "title": "Titre",
      "body": "Corps du message"
    },
    "android": {
      "priority": "HIGH",
      "ttl": "86400s",
      "notification": {
        "channel_id": "cdl_critical_alerts_v2",
        "sound": "default",
        "visibility": "PUBLIC",
        "notification_priority": "PRIORITY_MAX",
        "default_sound": true,
        "default_vibrate_timings": true,
        "notification_count": 1
      }
    }
  }
}
```

✅ Ce payload est correct. Le problème est **uniquement côté Android** : le channel doit exister.

---

## ✅ Fix 5 — Rebuild obligatoire après les changements

```bash
# Dans le dossier racine du projet
npx cap sync android

# Dans Android Studio :
# Build → Clean Project
# Build → Rebuild Project
# Run → Run 'app' (sur appareil physique, PAS émulateur)
```

---

## 🔍 Vérification après rebuild

### Logcat (dans terminal)
```bash
adb logcat | grep -E "CDL_FCM|FirebaseMessaging|NotificationChannel"
```

Vous devez voir au démarrage :
```
CDL_FCM: ✅ Notification channels créés: cdl_critical_alerts_v2 (IMPORTANCE_HIGH) + default
```

### Paramètres Android
Aller dans : **Paramètres → Applications → CDL → Notifications**
- Le canal "CDL Alertes Critiques" doit apparaître
- Vérifier qu'il est activé avec l'importance "Urgent" ou "Haute"

---

## ⚠️ Règle importante Android

**Android interdit de modifier l'importance d'un channel après sa création.**

Si vous avez déjà installé une version de l'APK avec un channel `cdl_critical_alerts_v2`
à une importance plus basse, vous devez :
1. **Désinstaller l'APK** complètement
2. **Réinstaller** avec la nouvelle version

Sinon le channel gardera son ancienne importance basse.

---

## Checklist finale

- [ ] `MainActivity.java` modifié avec `createNotificationChannels()`  
- [ ] `AndroidManifest.xml` : permission `POST_NOTIFICATIONS` ajoutée  
- [ ] `AndroidManifest.xml` : `default_notification_channel_id = cdl_critical_alerts_v2`  
- [ ] `npx cap sync android` exécuté  
- [ ] APK désinstallé puis réinstallé (si channel existait avant)  
- [ ] Logcat confirme "channels créés" au démarrage  
- [ ] Paramètres Android → CDL → Notifications → canal "CDL Alertes Critiques" visible  
- [ ] Test push reçu avec notification visible en barre système