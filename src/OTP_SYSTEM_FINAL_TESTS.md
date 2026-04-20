# 🔐 CDL OTP System — Guide de Test Final

## Architecture

```
PhoneAuth (pages/PhoneAuth)
├── UI: Écran 1 - Saisie numéro
│   ├── Input: +226XXXXXXXX
│   ├── Bouton: "Envoyer le code"
│   └── Bouton TEST: "🧪 Tester sendOTP"
├── Appel: /api/apps/{appId}/functions/sendOTP
│   ├── Retour: {success, message, error, twilio_error_code, ...}
│   └── Affichage: DEBUG BOX avec la vraie erreur Twilio
├── UI: Écran 2 - Vérification code
│   ├── Input: 6 chiffres
│   ├── Bouton: "Valider"
│   └── Affichage: DEBUG BOX si erreur
└── Appel: /api/apps/{appId}/functions/verifyOTPWithRedirect
    ├── Logique Admin: phone === "+22655738247" → /admin-dashboard
    ├── Logique User Existant: récupère profil actif → redirection
    └── Logique Nouvel User: crée user → /complete-profile/new
```

## Checklist des Secrets

Vérifier que **TOUS** ces secrets sont définis dans le dashboard:

- ✅ `TWILIO_ACCOUNT_SID` — SID du compte Twilio
- ✅ `TWILIO_AUTH_TOKEN` — Token d'authentification Twilio
- ✅ `TWILIO_VERIFY_SERVICE_SID` — SID du service Verify

**IMPORTANT:** Les secrets doivent être EXACTEMENT correctes sinon sendOTP échouera.

## Tests Manuels

### TEST A: Envoyer OTP vers admin (+22655738247)

1. Aller à `/phone-auth`
2. Cliquer sur "🧪 Tester sendOTP"
3. Observer le **DEBUG BOX** qui s'affiche
4. **Cas SUCCESS (✅):**
   ```json
   {
     "success": true,
     "step": "sendOTP",
     "phone": "+22655738247",
     "message": "Code OTP envoyé par SMS"
   }
   ```
5. **Cas FAILURE (❌):**
   ```json
   {
     "success": false,
     "step": "sendOTP",
     "phone": "+22655738247",
     "twilio_error_code": "...",
     "twilio_message": "...",
     "twilio_more_info": "...",
     "raw_error": "..."
   }
   ```

**Diagnostic des erreurs Twilio:**
- `21211`: Numero invalide (ne commence pas par +)
- `21214`: Numero non autorisé pour Twilio Trial (Verify pas activé)
- `20003`: Parametres invalides
- `20005`: Service Verify SID incorrect

### TEST B: Vérifier OTP avec code réel

1. Envoyer OTP via TEST A
2. Récupérer le code SMS reçu
3. Entrer le code dans écran 2
4. Cliquer "Valider"
5. **Cas SUCCESS (✅):**
   - Écran loading
   - Redirection vers `/admin-dashboard` (si +22655738247)
   - Ou redirection vers profil actif (si utilisateur existant)
   - Ou redirection vers `/complete-profile/new` (si nouvel utilisateur)
6. **Cas FAILURE (❌):**
   ```json
   {
     "success": false,
     "error": "Code OTP incorrect ou expiré",
     "step": "verifyOTP",
     "twilio_status": "...",
     "twilio_message": "..."
   }
   ```

### TEST C: Vérifier redirection admin

1. Saisir `55738247` (8 chiffres)
2. Envoyer code
3. Envoyer code correct
4. **Résultat attendu:** Redirection automatique vers `/admin-dashboard`
5. **Si redirection ne fonctionne pas:** Vérifier console browser pour URL

### TEST D: Vérifier redirection utilisateur existant

1. Créer/enregistrer un User en base avec:
   - `telephone: "+22612345678"`
   - `role: "user"`
   - Au moins 1 profil avec `current_role: true`
2. Saisir `12345678`
3. Envoyer code
4. Valider code correct
5. **Résultat attendu:** Redirection vers profil actif (ex: `/courses-disponibles` pour livreur)

### TEST E: Vérifier création nouvel utilisateur

1. Saisir un numéro qui n'existe PAS en base (ex: `99999999`)
2. Envoyer code
3. Valider code correct
4. **Résultat attendu:** Redirection vers `/complete-profile/new`
5. Vérifier en base que User a été créé avec `email: "phone_22699999999@cdl.local"`

## Test Automated (Page de test)

Aller à `/otp-system-test` pour lancer une suite de tests automatisés:

- ✅ sendOTP vers admin
- ✅ sendOTP vers test user
- ✅ sendOTP avec format invalide
- ✅ verifyOTP avec code invalide

Chaque test affiche la **vraie réponse du serveur** dans une DEBUG BOX.

## Logs à consulter

**Pour le frontend (Browser DevTools):**
```
[PhoneAuth] 📞 sendOTP call: { fullPhone: "+226..." }
[PhoneAuth] sendOTP response: { status: 200, data: {...} }
[PhoneAuth] ✅ OTP envoyé
```

**Pour le backend (Deno/Server logs):**
```
[sendOTP] 📞 Envoi OTP vers +226...
[sendOTP] ❌ Erreur Twilio API
[sendOTP] Response status: 401
[sendOTP] Response body: {"code": "21214", "message": "...", ...}
```

**Pour verifyOTP (Deno/Server logs):**
```
[verifyOTPWithRedirect] ✅ Code valide pour: +226...
[verifyOTPWithRedirect] 👨‍💼 ADMIN DÉTECTÉ
```

## Points Critiques

1. **Format téléphone:** Doit être exactement `+226XXXXXXXX` (pas d'espaces, pas d'autres formats)
2. **Numéro admin:** Doit être exactement `+22655738247`
3. **Secrets Twilio:** Doivent être correctes EXACTEMENT (un caractère faux = erreur)
4. **Service Verify:** Doit être activé sur le compte Twilio
5. **Numéros de test:** Twilio Trial limits les numéros autorisés (généralement besoin de vérifier en production)

## FAQ

**Q: Pourquoi je reçois "Configuration Twilio manquante"?**
- Réponse: Les secrets ne sont pas définis ou incorrects. Vérifier dashboard → Settings → Secrets.

**Q: Pourquoi je reçois "21214 Unable to create record"?**
- Réponse: Le numéro de test n'est pas vérifié sur le compte Twilio Trial. Ajouter numéro dans Twilio console.

**Q: Pourquoi la redirection admin ne fonctionne pas?**
- Réponse: Vérifier que le numéro est exactement `+22655738247`. Check console logs pour URL réelle.

**Q: Pourquoi j'ai pas reçu le SMS?**
- Réponse: 
  - Service Verify doit être activé sur Twilio
  - Numéro de test doit être ajouté sur Twilio Trial
  - Vérifier les logs backend pour erreur Twilio

**Q: Comment déboguer l'erreur Twilio complète?**
- Réponse: Cliquer sur "🧪 Tester sendOTP" et regarder le DEBUG BOX. L'erreur brute Twilio s'affiche.