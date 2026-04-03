# CDL STABILITÉ CHECKLIST - PRODUCTION READY

## ✅ ERRORBOUNDARY GLOBAL
- [x] App.jsx: ErrorBoundary wrapping tout
- [x] Mall.jsx: MallGlobalErrorBoundary + MallErrorBoundary
- [ ] LivreurHome: ErrorBoundary local si complexe
- [ ] DashboardPartenaire: ErrorBoundary local

## ✅ FALLBACKS PARTOUT
- [x] AdCarousel: Array.isArray + safeAds
- [x] PubliciteHomeBanner: Array.isArray checks
- [x] BedouWidget: null checks, defaults || 0
- [x] Mall: userEmail guard, Array.isArray maps
- [ ] CourseCard: verify all fields have fallbacks
- [ ] ClientHome: verify all lists protected

## ✅ UI NETTOYAGE
- [x] Publicité: pas de debug UI (red/gray boxes)
- [x] AdCarousel: propre, moderne
- [x] PubliciteHomeBanner: pas de texte technique
- [ ] Vérifier aucun "Loading", "userId", "debug" visible

## 🔄 BEDOU LOGIC
- [ ] Tester recharge OK
- [ ] Tester retrait OK
- [ ] Tester débit 5000F pub + crédit CDL
- [ ] Aucun bug de calcul

## 🔄 FLOW COMPLET
- [ ] CLIENT: créer compte → commander → Mall
- [ ] LIVREUR: reçevoir → accepter → voir Mall
- [ ] ANNONCEUR: créer pub → attendre validation
- [ ] ADMIN: valider pub → voir stats

## 🔄 MULTI-PROFILS
- [ ] 5 profils visibles et switchables
- [ ] Switch profil sans erreur
- [ ] Tous profils dans profils associés

## 🔄 NOTIFICATIONS
- [ ] Visibles en haut
- [ ] Disparaissent si non action
- [ ] Admin notifié (comptes, pubs, transactions)

## 🔄 PERFORMANCE
- [ ] Chargement rapide (<2s)
- [ ] Pas de boucle infinie
- [ ] Pas de refresh constant

## 🔄 SÉCURITÉ
- [ ] Permissions par profil OK
- [ ] Aucun accès admin non autorisé
- [ ] Données protégées

## ✅ VERSION
- [ ] versionCode ++
- [ ] versionName mis à jour
- [ ] APK clean build

## ✅ RÉSULTAT FINAL
- Stable 100%
- Pas de crash React
- UI propre
- Fluide
- Prêt Play Store