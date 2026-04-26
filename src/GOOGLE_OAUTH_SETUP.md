# Configuration Google OAuth pour CDL

## Problème
Erreur 403 "We're sorry, but you do not have access to this page." au clic sur "Continuer avec Google"

## Cause
La configuration Google OAuth n'est pas complète côté Base44. Base44 gère l'intégration OAuth nativement, mais a besoin de:
1. Credentials Google (Client ID + Secret)
2. URL de redirection correctement configurée
3. Écran de consentement OAuth configuré
4. Domaine autorisé
5. Votre compte test ajouté si l'app est en mode Test

## Étapes de résolution

### 1️⃣ Google Cloud Console — Créer/Vérifier les credentials

1. Aller sur **Google Cloud Console** : https://console.cloud.google.com/
2. Créer un nouveau projet ou en sélectionner un existant
3. **APIs & Services** → **Credentials**
4. **Create Credentials** → **OAuth Client ID**
   - Type: **Web Application**
   - Name: `CDL App`
   - Authorized JavaScript origins:
     ```
     https://api.base44.app
     https://cdl.base44.app
     http://localhost:3000 (pour dev local)
     ```
   - Authorized redirect URIs:
     ```
     https://api.base44.app/api/apps/69c3c74fc4b62396dca61751/oauth/google/callback
     ```
   - Cliquer **Create**

5. Copier le **Client ID** et le **Client Secret**

### 2️⃣ Configurer l'écran de consentement OAuth

1. **APIs & Services** → **OAuth consent screen**
2. Choix: **Internal** (test rapide) ou **External** (production)
3. Remplir les champs obligatoires:
   - App name: `CDL`
   - User support email: votre email
   - Developer contact info: votre email
4. **Save and Continue**
5. Dans **Scopes**, garder les defaults (openid, email, profile)
6. **Save and Continue**
7. Si vous avez choisi **External**, ajouter vos emails de test:
   - **Add Users** → Ajouter: weezyh2@gmail.com (ou votre compte)
8. **Save and Continue**

### 3️⃣ Configurer Base44 avec les credentials Google

1. Aller au **Dashboard Base44** → Settings → Environment Variables
2. Ajouter ou mettre à jour:
   - **GOOGLE_CLIENT_ID** = votre Client ID
   - **GOOGLE_CLIENT_SECRET** = votre Client Secret

   (Note: Ces peuvent être des secrets déjà nommés différemment — vérifier avec Base44)

### 4️⃣ Tester la configuration

1. **Admin** → **Test** → Appeler la fonction `checkGoogleOAuthConfig`
2. Vérifier que tous les checks passent ✅
3. La redirect URI affichée doit être:
   ```
   https://api.base44.app/api/apps/69c3c74fc4b62396dca61751/oauth/google/callback
   ```

### 5️⃣ Tester le bouton Google

1. Aller sur `/connexion`
2. Cliquer sur **"Continuer avec Google"**
3. Vous devez être redirigé vers Google consent
4. Approuver → revenir à CDL avec un token valide
5. Redirection automatique vers `/` (dashboard)

## ⚠️ Erreurs courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| 403 Access Denied | Credentials manquantes/invalides | Vérifier Google Cloud Console |
| Invalid redirect_uri | URI non configurée dans Google | Ajouter exactement: `https://api.base44.app/api/apps/69c3c74fc4b62396dca61751/oauth/google/callback` |
| App not registered | L'app n'est pas dans la liste de consentement | Créer l'app dans Google Cloud Console |
| Test user not added | OAuth en mode Test mais compte non autorisé | Ajouter votre email dans **OAuth consent screen** → Test users |

## 🔗 Ressources

- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Base44 OAuth Integration](https://docs.base44.app)

## ✅ Checklist finale

- [ ] Client ID + Secret obtenus de Google Cloud
- [ ] Redirect URI configuré: `https://api.base44.app/api/apps/69c3c74fc4b62396dca61751/oauth/google/callback`
- [ ] Écran de consentement OAuth configuré (Internal ou External)
- [ ] Si External: votre compte test ajouté
- [ ] Secrets GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET configurés dans Base44
- [ ] Fonction `checkGoogleOAuthConfig` retourne tous les checks ✅
- [ ] Bouton "Continuer avec Google" redirige correctement