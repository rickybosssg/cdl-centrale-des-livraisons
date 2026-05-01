# 🔴 FCM Erreur 403 — Comment Fixer les Permissions

## 🎯 Problème
Envoi FCM échoue avec **HTTP 403 FORBIDDEN** — Le service account n'a pas les permissions pour accéder à l'API Firebase Cloud Messaging.

---

## ✅ Solution en 3 Étapes

### **1️⃣ Accéder à Google Cloud Console**

1. Ouvrir [Google Cloud Console](https://console.cloud.google.com)
2. **Sélectionner le projet CDL** (coin haut gauche)
3. Chercher le **Project ID** — devrait être quelque chose comme `cdl-xxxxx` ou contenir "cdl"
4. Vérifier dans les secrets Base44 que `FIREBASE_SERVICE_ACCOUNT_JSON` contient ce même project ID

### **2️⃣ Ajouter les Permissions du Service Account**

#### Méthode A : Via IAM (Recommandé)
1. **IAM & Admin** → **Service Accounts** (sur la gauche)
2. Chercher le service account (celui avec l'email dans `FIREBASE_SERVICE_ACCOUNT_JSON`)
3. Cliquer dessus → **Onglet Rôles**
4. **Ajouter un rôle** :
   - Chercher : `Firebase Service Agent`
   - Assigner ce rôle
5. **Sauvegarder**

#### Méthode B : Via Firebase Console
1. **Aller sur [Firebase Console](https://console.firebase.google.com)**
2. **Sélectionner le projet CDL**
3. **Project Settings** (coin bas gauche) → **Service Accounts**
4. Vérifier que le service account a le rôle `Firebase Admin`

### **3️⃣ Vérifier les API Activées**

1. **APIs & Services** → **Enabled APIs & services**
2. Chercher ou activer :
   - ✅ **Firebase Cloud Messaging API**
   - ✅ **Firebase Admin SDK API** (optionnel mais recommandé)

---

## 📊 Vérifier que ça Marche

### Via Admin Panel
1. Aller dans **Admin Dashboard** → **Diagnostics FCM** (ou `/admin-auth-diagnostics`)
2. Cliquer **"Lancer le diagnostic"**
3. Regarder les résultats :
   - ✅ **access_token** : `OK` → JWT signé avec succès
   - ✅ **fcm_api** : `OK` → API accessible
   - ❌ Si `fcm_api` = **403 Forbidden** → Permissions insuffisantes (voir Étape 2)

---

## 🔧 Checklist Complète

- [ ] Projet CDL sélectionné dans Google Cloud
- [ ] Service account trouvé dans IAM & Admin
- [ ] Rôle `Firebase Service Agent` assigné
- [ ] `FIREBASE_SERVICE_ACCOUNT_JSON` contient le bon project_id
- [ ] Firebase Cloud Messaging API activée
- [ ] Diagnostic montre `fcm_api: OK`
- [ ] Token généré côté Android ✅
- [ ] Notification reçue après test ✅

---

## 🚀 Test Final

Après les changements :

```
Admin Dashboard → Diagnostics FCM → Lancer le diagnostic
↓
Si ✅ fcm_api: OK → Test rapide notification
↓
Si ✅ Notification reçue → FCM OPERATIONNEL ✅
```

---

## ⚠️ Erreurs Couantes

| Erreur | Cause | Solution |
|--------|-------|----------|
| 403 Forbidden | Permissions insuffisantes | Ajouter `Firebase Service Agent` |
| 401 Unauthorized | Access token invalide | Vérifier `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Invalid Project ID | Project mismatch | Vérifier que project_id dans SA = Firebase project |
| Service not found | API non activée | Activer Firebase Cloud Messaging API |

---

## 📞 Support

Si ça continue à échouer :

1. Vérifier les **Audit Logs** dans Google Cloud Console
2. Regarder les **Logs Deno** dans Base44 (fonction `sendFcmNotification`)
3. S'assurer que le **Service Account Email** a accès au projet Firebase