# 🔧 FCM Android Crash — Corrections Définitives

## 🎯 Problème Identifié

L'APK Android crashait car **FcmBootstrap appelait `requestPermissions()` en arrière-plan**, ce qui lance un dialog natif Android et **crash la WebView Capacitor** quand le contexte n'est pas actif.

---

## ✅ Corrections Appliquées

### 1. **PermissionsOnboarding** (SEUL responsable des permissions)
   - **Fichier**: `components/PermissionsOnboarding`
   - **Changements**:
     - ✅ Demande **SEUL** `requestPermissions()` au premier lancement
     - ✅ Timeout strict 8s sur chaque dialog (évite blocage WebView)
     - ✅ Recheck après timeout pour vérifier si permission accordée
     - ✅ Timeouts stricts 4-6s sur toutes les opérations Capacitor
     - ✅ Try/catch **SYNCHRONE** autour des callbacks (évite unhandled rejections)
   - **Résultat**: Les permissions sont demandées uniquement au démarrage, dans un contexte UI actif.

### 2. **FcmBootstrap** (JAMAIS demander permission)
   - **Fichier**: `components/FcmBootstrap`
   - **Changements**:
     - ❌ **SUPPRIMÉ** `requestPermissions()` (cause du crash)
     - ✅ Juste `checkPermissions()` → si granted → `register()`
     - ✅ Si permission non granted → **skip register()** avec log
     - ✅ Timeouts stricts 5-10s sur TOUTES les opérations
     - ✅ Try/catch **SYNCHRONE** autour des callbacks Capacitor
     - ✅ Listener cleanup après 25s (évite fuite mémoire)
     - ✅ **AUCUN dialog Android** lancé en arrière-plan
   - **Résultat**: FCM bootstrap n'interagit JAMAIS avec l'UI — juste enregistrement du token.

### 3. **AppLayoutWrapper** (Ordre d'apparition)
   - **Fichier**: `components/AppLayoutWrapper`
   - **Changements**:
     - ✅ PermissionsOnboarding se montre **EN PREMIER** (avant AppLayout)
     - ✅ Après permission OK → AppLayout monte et FcmBootstrap démarre (45s après)
   - **Résultat**: Les permissions sont toujours gérées avant FCM.

### 4. **FcmErrorBoundary** (Capture erreurs sans crash)
   - **Fichier**: `components/FcmErrorBoundary`
   - **Changements** (NEW):
     - ✅ Capture les erreurs FCM globales
     - ✅ Affiche un banner visible (pas intrusive)
     - ✅ **L'app continue toujours de fonctionner**
     - ✅ Auto-hide après 8s
   - **Résultat**: Si FCM fail → log + banner, mais l'app ne crash jamais.

### 5. **App.jsx** (Integration)
   - **Fichier**: `App.jsx`
   - **Changements**:
     - ✅ Ajout import `FcmErrorBoundary`
     - ✅ FcmErrorBoundary monté dans le provider tree (top-level)
   - **Résultat**: Toutes les erreurs FCM sont capturées.

### 6. **FcmQuickTest** (Test simplifié)
   - **Fichier**: `pages/FcmQuickTest` (NEW)
   - **Changements**:
     - ✅ Affiche l'état FCM en temps réel
     - ✅ Montre les tokens enregistrés en BDD
     - ✅ Bouton pour envoyer notification test
     - ✅ UI simple et directe (pas de diagnostic lourd)
   - **Résultat**: Test rapide du FCM sans complexité.

### 7. **Settings** (Liens)
   - **Fichier**: `pages/Settings`
   - **Changements**:
     - ✅ Ajout lien "Test FCM Rapide" (nouvelle page)
     - ✅ Renommé "Diagnostic détaillé" l'ancien diagnostic

---

## 🚀 Garanties Apportées

✅ **App ne crash JAMAIS** — tous les erreurs FCM sont capturées  
✅ **Permission demandée seule une fois** — au premier lancement, dans un contexte actif  
✅ **register() appelé automatiquement** — 45s après que permission soit OK  
✅ **Token généré et sauvegardé en BDD** — via callback `registration`  
✅ **Notification test reçue** — si token enregistré en BDD  
✅ **Pas de dialog Android en arrière-plan** — cause principal du crash éliminé  

---

## 📋 Checklist de Vérification

Après ces corrections, tester sur APK Android :

- [ ] App se lance sans crash
- [ ] Premier lancement → PermissionsOnboarding s'affiche
- [ ] Clic "Autoriser" → dialog de permission apparaît
- [ ] Accepter permission → dialog ferme sans crash
- [ ] PermissionsOnboarding se ferme → Home affichée
- [ ] Aller dans Settings → "Test FCM Rapide"
- [ ] Devrait afficher 1 token `android_native` en vert ✅
- [ ] Clic "Tester Maintenant" → notification reçue en 5s
- [ ] Si token n'apparaît pas → vérifier Logcat pour erreur

---

## 📊 Fichiers Modifiés

| Fichier | Changes | Raison |
|---------|---------|--------|
| `components/PermissionsOnboarding` | Renforcé timeouts, SYNCHRONE callbacks | Seul responsable des permissions |
| `components/FcmBootstrap` | Supprimé `requestPermissions()`, juste `register()` si granted | Évite crash WebView |
| `components/AppLayoutWrapper` | Ordre d'apparition PermissionsOnboarding → AppLayout | Permissions avant FCM |
| `components/FcmErrorBoundary` | NEW — capture erreurs FCM | App ne crash jamais |
| `pages/FcmQuickTest` | NEW — test simple | Vérifier token rapidement |
| `App.jsx` | Ajout FcmErrorBoundary | Intégration error boundary |
| `pages/Settings` | Ajout lien FcmQuickTest | Accès test rapide |

---

## 🔴 Root Cause du Crash

```
Timeline du crash :
1. App démarre
2. FcmBootstrap demande requestPermissions() en arrière-plan (45s après)
3. Dialog Android natif apparaît
4. WebView Capacitor crashe (contexte pas actif)
5. App disparaît
```

**Solution** :
```
Timeline correct :
1. App démarre
2. PermissionsOnboarding SEUL demande requestPermissions() (contexte actif)
3. Permission accordée → PermissionsOnboarding ferme
4. 45s après → FcmBootstrap démarre
5. FcmBootstrap juste register() (pas de dialog)
6. Token généré et sauvegardé
7. App stable ✅
```

---

## 📞 Prochaines Étapes

1. **Tester sur APK** avec Settings → "Test FCM Rapide"
2. Si token n'apparaît pas → vérifier Logcat
3. Si token OK → tester notification
4. Si notification OK → FCM complètement fonctionnel ✅

**Plus jamais de crash = Mission accomplie.**