# 🔴 FCM Erreur 403 — Solution Complète

## 🎯 Le Problème

L'envoi FCM échoue avec erreur **HTTP 403 FORBIDDEN**. Cela signifie que le Service Account n'a pas les permissions suffisantes pour utiliser l'API Firebase Cloud Messaging.

---

## ✅ Solutions Étape par Étape

### **Étape 1 : Vérifier le Service Account JSON**

Le secret `FIREBASE_SERVICE_ACCOUNT_JSON` doit contenir :
```json
{
  "type": "service_account",
  "project_id": "cdl-xxx",  // ou un ID contenant "cdl"
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@cdl-xxx.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx@cdl-xxx.iam.gserviceaccount.com"
}
```

**Où trouver ?**
1. Google Cloud Console → Sélectionner projet CDL
2. IAM & Admin → Service Accounts
3. Cliquer sur le service account utilisé par Base44
4. Onglet Clés → Créer clé → JSON
5. Copier-coller le contenu complet dans Base44 Secret `FIREBASE_SERVICE_ACCOUNT_JSON`

---

### **Étape 2 : Ajouter la Permission "Firebase Admin" au Service Account**

C'est la cause de l'erreur 403. Le service account doit avoir le rôle approprié.

**Actions :**
1. Google Cloud Console → IAM & Admin → IAM
2. Chercher le service account (par son email : `firebase-adminsdk-xxxxx@...`)
3. Cliquer sur le service account → Onglet "Rôles"
4. Cliquer "Modifier les rôles" → "Ajouter un autre rôle"
5. Chercher et ajouter : **"Firebase Service Agent"**
6. OU ajouter : **"Firebase Admin"** (rôle plus large)
7. Sauvegarder

**Résumé des rôles requis :**
- ✅ `roles/firebase.admin` (recommandé — accès complet Firebase)
- ✅ `roles/servicemanagement.admin` (alternative)
- ❌ `roles/viewer` (insuffisant — cause 403)

---

### **Étape 3 : Vérifier le Project ID dans Firebase Console**

**Actions :**
1. Aller à https://console.firebase.google.com
2. Sélectionner le projet CDL
3. Project Settings (roue ⚙️) → Général
4. Vérifier que "Project ID" correspond à celui dans le Service Account JSON

**Expected :** Le project_id dans le JSON doit correspondre à celui de Firebase Console.

---

### **Étape 4 : Tester avec la Fonction Diagnostic**

Une fois les corrections faites, utiliser la fonction de diagnostic pour vérifier :

**Pour Admin (dashboard) :**
1. Aller à Admin Dashboard
2. Cliquer "Outils & Diagnostic" → "🔔 FCM"
3. Cliquer "Lancer le diagnostic"
4. Si résultat = ✅ "Configuration FCM CORRECTE" → c'est bon

**Pour Users (Settings) :**
1. Settings → "Test FCM Rapide"
2. Si un token vert s'affiche → FCM est prêt à envoyer

---

## 📋 Checklist Complète

- [ ] Service Account JSON copié dans Base44 Secret `FIREBASE_SERVICE_ACCOUNT_JSON`
- [ ] Service Account a le rôle "Firebase Service Agent" ou "Firebase Admin"
- [ ] Project ID dans le JSON correspond à Firebase Console
- [ ] Fonction diagnostic retourne ✅ "Configuration FCM CORRECTE"
- [ ] Token FCM enregistré en BDD (visible dans "Test FCM Rapide")
- [ ] Notification test reçue avec succès

---

## 🚀 Après les Corrections

Une fois les permissions ajoutées (peut prendre 5-10 minutes) :

1. **Tester l'envoi :**
   ```
   Admin Dashboard → Outils → 🔔 FCM → Lancer diagnostic
   ```

2. **Si ✅ "Configuration FCM CORRECTE" :**
   - C'est bon ! L'API est maintenant accessible
   - Les notifications peuvent être envoyées

3. **Si ❌ Toujours 403 :**
   - Attendre 10 minutes (IAM peut être en retard)
   - Vérifier que le rôle a été assigné au **bon** service account
   - Réessayer le diagnostic

---

## 📞 Erreurs Courantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| 403 Forbidden | Service Account n'a pas les permissions | Ajouter rôle "Firebase Service Agent" |
| 401 Unauthorized | Access token invalide | Vérifier que private_key est correcte |
| "INVALID_ARGUMENT" | Token FCM invalide | Normal — le token test n'existe pas |
| Project not found | Project ID ne correspond pas | Vérifier project_id dans JSON vs Firebase Console |

---

## 🔧 Code Côté Serveur (Référence)

La fonction `sendFcmNotification` vérifie déjà :
- ✅ Service Account JSON valide
- ✅ Project ID extrait
- ✅ JWT signing (access token généré)
- ✅ Authorization header correct

Le problème 403 vient **uniquement** de permissions insuffisantes sur le service account.

---

**Une fois les permissions ajoutées dans Google Cloud, les erreurs 403 disparaîtront et l'envoi FCM fonctionnera.**