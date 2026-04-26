# 🔧 Correction Google OAuth — Configuration Complète

## ⚠️ Problème
Erreur 403 "We're sorry, but you do not have access to this page." quand on clique sur "Continuer avec Google"

## 🔍 Diagnostic Rapide

1. **Admin** → `/google-oauth-debug` (accessible si connecté en tant qu'admin)
2. Cette page affiche:
   - ✅ L'URL de callback OAuth exacte
   - ✅ Les domaines autorisés requis
   - ✅ Checklist complète de configuration
   - ✅ Causes possibles de l'erreur 403

## 📋 Checklist Configuration Google OAuth

### 1️⃣ Google Cloud Console Setup

**🌐 URL:** https://console.cloud.google.com/

1. **Créer un projet** ou en sélectionner un
2. **APIs & Services** → **Credentials**
3. **Create Credentials** → **OAuth 2.0 Client ID**
   - Type: **Web Application**
   - Name: `CDL`

4. **Authorized JavaScript Origins** (ajouter):
   ```
   https://api.base44.app
   https://cdl.base44.app
   http://localhost:3000
   ```

5. **Authorized redirect URIs** (EXACT, ne pas modifier):
   ```
   https://api.base44.app/api/apps/69c3c74fc4b62396dca61751/oauth/google/callback
   ```

6. **Create** → Copier **Client ID** et **Client Secret**

---

### 2️⃣ OAuth Consent Screen

**🌐 URL:** Google Cloud Console → **APIs & Services** → **OAuth consent screen**

1. **Choix du type d'app:**
   - **Internal** = Test rapide (juste votre compte)
   - **External** = Production (accepte tous les comptes Google)

2. **Remplir les infos:**
   - App name: `CDL`
   - User support email: `contact@cdl.bf` (ou votre email)
   - Developer contact email: `contact@cdl.bf`

3. **Scopes** (garder les defaults):
   - openid
   - email
   - profile

4. **Save and Continue**

5. **Si vous avez choisi External:**
   - Aller à **Test Users**
   - **Add Users**
   - Ajouter: `weezyh2@gmail.com` (et votre email de test)
   - **Save and Continue**

---

### 3️⃣ Configuration Base44

**📍 Base44 Dashboard:**

1. **Settings** → **Environment Variables** (ou équivalent)
2. Vérifier/Ajouter:
   ```
   GOOGLE_CLIENT_ID = [votre Client ID de Google Cloud]
   GOOGLE_CLIENT_SECRET = [votre Client Secret de Google Cloud]
   ```

3. **Activer Google OAuth** pour cette app (si option disponible)

---

## 🧪 Test et Vérification

### Test 1: Diagnostic Page
```
Admin → /google-oauth-debug
```
Vérifier que tous les éléments affichés correspondent à votre config Google Cloud.

### Test 2: Bouton Google
```
1. Aller à /connexion
2. Cliquer "Continuer avec Google"
3. Vous devez être redirigé vers Google consent screen
4. Approuver → Revenir à CDL
5. Redirection automatique vers / (dashboard)
```

### Test 3: Logs Browser
```
F12 → Console
Chercher: [GoogleLogin] ou erreurs OAuth
```

---

## 🚨 Dépannage Erreur 403

| Symptôme | Cause | Solution |
|----------|-------|----------|
| **Erreur 403** | Credentials manquantes | Vérifier GOOGLE_CLIENT_ID/SECRET dans Base44 |
| **Erreur 403** | Domaine non autorisé | Ajouter `https://cdl.base44.app` dans Google Cloud Origins |
| **Erreur 403** | Redirect URI ne correspond pas | Utiliser exactement: `https://api.base44.app/api/apps/69c3c74fc4b62396dca61751/oauth/google/callback` |
| **Erreur 403** | App en mode Test but compte non test user | Ajouter votre email dans OAuth Consent Screen → Test Users |
| **Blank page après clic** | Erreur JavaScript | Vérifier F12 → Console pour les erreurs |
| **Timeout** | Connexion réseau ou Google down | Vérifier que vous pouvez accéder à Google normalement |

---

## 🔐 Points de Sécurité

✅ **Client ID/Secret gérés par Base44** — Pas stockés côté client
✅ **HTTPS obligatoire** — Tous les domaines doivent être HTTPS
✅ **Callback URI exact** — Aucune variation tolérée
✅ **Pas de logique OAuth custom** — Utiliser le natif Base44

---

## 📝 Notes Importantes

1. **Propagation** — Les changements Google peuvent prendre 5-10 minutes
2. **Test User** — Si mode **External**, votre compte Google DOIT être ajouté
3. **Localhost** — Pour dev local, ajouter `http://localhost:3000` aux Origins
4. **App Type** — **Internal** est plus rapide pour tester
5. **Écran de consentement** — Doit être configuré même en mode Internal

---

## 📚 Ressources

- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [CDL Google OAuth Debug](/google-oauth-debug)

---

## ✅ Validation Finale

- [ ] Google Project créé
- [ ] OAuth 2.0 Credentials générées
- [ ] Client ID + Secret obtenus
- [ ] Authorized Origins: https://api.base44.app + https://cdl.base44.app
- [ ] Authorized Redirect URI: https://api.base44.app/api/apps/69c3c74fc4b62396dca61751/oauth/google/callback
- [ ] OAuth Consent Screen configuré
- [ ] Si External: Test users ajoutés
- [ ] Base44 secrets configurés (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- [ ] /google-oauth-debug affiche ✅ partout
- [ ] Bouton "Continuer avec Google" redirige vers consent screen
- [ ] Après approbation: redirection vers CDL dashboard ✅