# GUIDE DE TEST – CAMÉRA / GALERIE PROFIL LIVREUR

## 📋 Objectif
Valider que les boutons Caméra et Galerie fonctionnent correctement sur tous les appareils (APK, navigateur mobile/desktop).

---

## 🚀 CHECKLIST PRÉ-TEST

- [ ] Code déployé (DocumentUploader.jsx + CompleteProfile.jsx mis à jour)
- [ ] APK à jour
- [ ] Navigateur mobile/desktop à jour
- [ ] Connexion internet stable

---

## 📱 TEST 1 : APK ANDROID (PRIORITÉ)

### A. Ouverture caméra
**Étapes :**
1. Installer l'APK sur téléphone Android
2. Se connecter en tant que livreur
3. Aller dans le profil → Compléter mon profil
4. Cliquer sur le bouton **"Caméra"** du champ "CNI Recto"
5. Vérifier l'ouverture réelle de la caméra du téléphone

**✅ Validé si :**
- La caméra s'ouvre réellement
- On peut prendre une photo
- La photo est capturée
- Message toast "✅ CNI Recto chargé depuis la caméra"

**❌ Échoué si :**
- Le bouton ne réagit pas
- Erreur : "Impossible d'ouvrir la caméra"
- Rien ne se passe après le clic

---

### B. Ouverture galerie
**Étapes :**
1. Cliquer sur le bouton **"Galerie"** du champ "CNI Verso"
2. Vérifier l'ouverture réelle de la galerie photo du téléphone
3. Choisir une image existante

**✅ Validé si :**
- La galerie s'ouvre réellement
- On peut choisir une image
- L'image est chargée
- Aperçu visible avec ✅ "Chargé"
- Message toast "✅ CNI Verso chargé depuis la galerie"

**❌ Échoué si :**
- Le bouton ne réagit pas
- Erreur : "Impossible d'ouvrir la galerie"
- Aperçu ne s'affiche pas

---

### C. Teste chaque document séparément
**Répéter A+B pour :**
- [ ] Photo profil → Caméra → Galerie
- [ ] CNI Recto → Caméra → Galerie
- [ ] CNI Verso → Caméra → Galerie
- [ ] Moyen de déplacement → Caméra → Galerie

**Vérifier :**
- Chaque fichier va dans le **bon champ**
- Pas de mélange entre documents
- Aperçus distincts pour chaque photo

---

## 💻 TEST 2 : NAVIGATEUR MOBILE

**Environnement :**
- Chrome/Firefox sur téléphone mobile
- URL : `/complete-profile/:profileId`

**Étapes (identiques au test APK) :**
1. Cliquer Caméra → caméra s'ouvre
2. Prendre photo → aperçu visible
3. Cliquer Galerie → galerie s'ouvre
4. Choisir image → aperçu visible

**✅ Validé si :** Fonctionnement identique à APK

**❌ Échoué si :** Un bouton ne fonctionne pas

---

## 🖥️ TEST 3 : NAVIGATEUR DESKTOP

**Environnement :**
- Chrome/Firefox sur ordinateur

**Étapes :**
1. Cliquer Caméra → sélecteur fichier s'ouvre
2. Sélectionner une image
3. Cliquer Galerie → sélecteur fichier s'ouvre
4. Sélectionner une image

**✅ Validé si :** Upload fonctionne (sans caméra réelle sur desktop)

---

## 🔐 TEST 4 : PERMISSIONS

### A. Permission refusée puis acceptée
**Étapes (APK Android) :**
1. Cliquer Caméra
2. **Refuser** la permission demandée
3. Vérifier message d'erreur
4. Retourner dans l'app
5. Cliquer Caméra à nouveau
6. **Accepter** la permission
7. Caméra doit s'ouvrir

**✅ Validé si :**
- Refus → message clair : "Permission caméra refusée"
- Acceptation → caméra s'ouvre

---

## ⚡ TEST 5 : GESTION DES ERREURS

### A. Fichier trop volumineux
**Étapes :**
1. Prendre une photo/vidéo >5MB
2. Sélectionner → Upload

**✅ Validé si :** Message "Fichier trop volumineux (max 5MB)"

### B. Format invalide
**Étapes :**
1. Essayer de charger un PDF/DOC (non-image)

**✅ Validé si :** Message "Format de fichier non autorisé"

### C. Pas de crash
**Étapes :**
1. Charger plusieurs documents successifs
2. Changer de champ rapidement
3. Revenir en arrière et relancer

**✅ Validé si :** Aucun crash, App reste stable

---

## 📊 TEST 6 : APERÇU ET ENREGISTREMENT

**Étapes :**
1. Charger CNI Recto (caméra ou galerie)
2. Vérifier aperçu visible avec ✅ "Chargé"
3. Cliquer "Remplacer" → charger nouvelle image
4. Vérifier nouvel aperçu
5. Envoyer le profil pour validation
6. Vérifier en base que le fichier est bien enregistré

**✅ Validé si :**
- Aperçu visible immédiatement
- Replacement fonctionne
- Fichier persiste après submission

---

## 🎯 TABLEAU DE RÉSUMÉ

| Cas de test | APK | Mobile Nav | Desktop | Status |
|---|---|---|---|---|
| Ouverture caméra | ⬜ | ⬜ | N/A | |
| Ouverture galerie | ⬜ | ⬜ | ⬜ | |
| Photo → Aperçu | ⬜ | ⬜ | ⬜ | |
| Champs séparés | ⬜ | ⬜ | ⬜ | |
| Permission refusée | ⬜ | ⬜ | N/A | |
| Permission acceptée | ⬜ | ⬜ | N/A | |
| Fichier trop gros | ⬜ | ⬜ | ⬜ | |
| Format invalide | ⬜ | ⬜ | ⬜ | |
| Pas de crash | ⬜ | ⬜ | ⬜ | |
| Upload → Base | ⬜ | ⬜ | ⬜ | |

**Remplir avec :** ✅ OK / ❌ KO / ⬜ À tester

---

## 🔍 CONSOLE / LOGS

Si erreur, **ouvrir la console** (F12) et chercher :
```
[DocumentUploader] Ouverture caméra pour CNI Recto
[DocumentUploader] Fichier sélectionné pour CNI Recto: photo.jpg 1024000 image/jpeg
[DocumentUploader] Upload réussi pour CNI Recto
```

**Copier l'intégralité des logs d'erreur en cas de problème.**

---

## 📝 RÉSULTATS FINAUX

### Status global
- [ ] 🟢 VALIDÉ – Tout fonctionne
- [ ] 🟡 PARTIELLEMENT – Quelques choses ne fonctionnent pas
- [ ] 🔴 ÉCHOUÉ – Ne fonctionne pas

### Problèmes identifiés
```
- Problème 1: ...
- Problème 2: ...
```

### Actions à prendre
```
- Action 1: ...
- Action 2: ...
```

---

**Date du test :** _______________
**Testeur :** _______________
**Plateforme :** APK / Navigateur mobile / Desktop