# Guide Logcat — Debug FCM Android Crash

## 🚀 Avant le test

1. Connecter téléphone en USB (Mode développeur activé)
2. Vérifier que `adb` fonctionne:
   ```bash
   adb devices
   ```
   Tu dois voir ton téléphone listé.

---

## 🔍 ÉTAPE 1 : Capturer les logs AVANT le crash

**Ouvrir un terminal et exécuter:**
```bash
adb logcat -v threadtime > fcm_crash_logs.txt &
```

Cela enregistre **TOUS les logs** dans `fcm_crash_logs.txt` en temps réel.

**Alternative (version courte):**
```bash
adb logcat
```
(Affiche les logs directement dans le terminal)

---

## 📱 ÉTAPE 2 : Tester le scénario sur l'APK

1. Lancer l'app sur ton téléphone
2. Se connecter avec ton compte
3. Aller dans Settings → "Test FCM complet"
4. Cliquer sur **"Lancer test complet"**
5. **À l'écran "Demander permission"**, cliquer sur **"Autoriser et continuer"**
6. **Attendre** 30 secondes après le dialog de permission

**Si l'app crash :**
- Noter l'heure exacte du crash
- Continuer à laisser logcat tourner

**Si l'app ne crash pas :**
- Continuer 5 minutes minimum
- Laisser tourner les logs

---

## 🛑 ÉTAPE 3 : Arrêter la capture

Appuyer sur **Ctrl+C** dans le terminal pour arrêter logcat.

---

## 📊 ÉTAPE 4 : Extraire les logs pertinents

```bash
# Chercher les erreurs
grep -i "error\|exception\|crash\|fatal" fcm_crash_logs.txt

# Chercher les logs FCM
grep -i "fcm\|firebase\|push\|notification" fcm_crash_logs.txt

# Chercher les logs PushNotifications (Capacitor)
grep -i "pushnotifications" fcm_crash_logs.txt

# Chercher les logs WebView
grep -i "webview\|chromium" fcm_crash_logs.txt

# Voir les 100 DERNIÈRES lignes (moment du crash)
tail -100 fcm_crash_logs.txt
```

---

## 📋 Quoi copier/coller pour moi

Si l'app crash, **envoie-moi :**

1. **Les 50 dernières lignes de logcat** (moment du crash) :
   ```bash
   tail -50 fcm_crash_logs.txt
   ```

2. **Toutes les lignes avec "ERROR" ou "FATAL"** :
   ```bash
   grep -i "error\|fatal\|exception" fcm_crash_logs.txt
   ```

3. **Les logs FCM spécifiques** :
   ```bash
   grep -i "fcm\|firebase\|pushnotifications" fcm_crash_logs.txt
   ```

---

## 🎯 Checklist du test

- [ ] Terminal logcat ouvert et enregistrant
- [ ] App lancée et connectée
- [ ] Test FCM complet started
- [ ] Permission dialog montré
- [ ] Appuyé sur "Autoriser"
- [ ] 30 secondes écoulées (ou crash)
- [ ] Logcat arrêté (Ctrl+C)
- [ ] Logs extrait et prêts à envoyer

---

## ✉️ Format pour me rapporter

Quand tu m'envoies les logs, utilise ce format:

```
[ANDROID FCM TEST REPORT]
Date: 2026-05-01
Phone: [Marque/Modèle Android]
App State: [App crashed / App stable]
Time of crash: [HH:MM:SS or N/A]

=== LOGCAT EXCERPT ===
[Coller les 50 dernières lignes ici]

=== ERROR/FATAL LINES ===
[Coller les lignes avec ERROR/FATAL ici]

=== FCM-SPECIFIC LOGS ===
[Coller les logs FCM/Firebase ici]

=== OBSERVATIONS ===
[Décris ce que tu as vu]
```

---

## 🔧 Troubleshooting logcat

**Erreur: "adb: command not found"**
→ Android SDK pas installé. Installe Android Studio.

**Erreur: "device offline"**
→ Débrancher/rebrancher USB, ou tuer adb: `adb kill-server`

**Pas de logs** 
→ Appuyé sur le bon terminal ? Vérifier que logcat affiche quelque chose.

---

**Merci et bon debug! 🚀**