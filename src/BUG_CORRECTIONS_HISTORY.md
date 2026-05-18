# 📋 Historique des corrections de bugs — CDL App

> Fichier généré le : 2026-05-18  
> Objectif : mémoire permanente pour éviter de recorriger les mêmes bugs.

---

## 🐛 BUG #1 — Annulation de course (client + admin) / Erreur 403

**Statut** : ✅ RÉSOLU  
**Total corrections tentées** : **7**  
**Dernière correction** : 2026-05-18

---

### Corrections chronologiques

| # | Date | Cause identifiée | Fichiers modifiés | Pourquoi le bug est revenu |
|---|------|------------------|-------------------|---------------------------|
| 1 | 2025 (early) | Fonction `cancelCourseAction` inexistante — 404 | `functions/cancelCourseAction.js` | `user.role` non vérifié correctement → 403 admins |
| 2 | 2025 | Admin APK : `user_type="admin"` mais `role="user"` → 403 | `functions/cancelCourseAction.js` | Comparaison email case-sensitive → faux 403 client |
| 3 | 2025 | `user.email` APK en majuscules vs BDD minuscules → 403 client | `functions/cancelCourseAction.js` | Subscription realtime réinjectait la course annulée |
| 4 | 2025-2026 | UI `GererCourses` ne retirait pas la course après annulation | `components/AdminCourseActions.jsx`, `pages/dispatcher/GererCourses.jsx` | Subscription `update` → `map` sans check `is_deleted` |
| 5 | 2026 (session -1) | Event `update` post-delete réinjectait le fantôme | `pages/dispatcher/GererCourses.jsx` | `ActiveCourseSummary` sans guard `is_deleted` |
| 6 | 2026 (session -1) | `ActiveCourseSummary` subscription `create`+`update` sans `is_deleted` | `components/dashboard/ActiveCourseSummary.jsx` | `useDriverCourseAlert` fallback sans garde statut |
| 7 | 2026-05-18 | Fallback Notification → fetch course annulée. `useManualDispatchAlert` update sans `is_deleted` | `hooks/useDriverCourseAlert.js`, `hooks/useManualDispatchAlert.js` | *(correction active — pas de régression connue)* |

---

### Tous les fichiers touchés par ce bug

```
functions/cancelCourseAction.js          ← logique métier, auth, 403
components/AdminCourseActions.jsx        ← UI admin, callback onDone
components/CancelCourseDialog.jsx        ← UI client
pages/dispatcher/GererCourses.jsx        ← subscription update guard is_deleted
components/dashboard/ActiveCourseSummary.jsx  ← subscription create+update guard is_deleted
hooks/useDriverCourseAlert.js            ← fallback Notification + update statut terminal
hooks/useManualDispatchAlert.js          ← subscription update guard is_deleted
```

---

### Subscriptions/hooks à surveiller en priorité si régression

| Fichier | Ce qu'il faut vérifier |
|---------|------------------------|
| `pages/dispatcher/GererCourses.jsx` | `Course.subscribe` update → `filter` si `is_deleted`, sinon `map` |
| `components/dashboard/ActiveCourseSummary.jsx` | `Course.subscribe` create+update → `!ev.data.is_deleted` obligatoire |
| `hooks/useDriverCourseAlert.js` | Fallback Notification → `STATUTS_INVALIDES` + effacement si statut terminal |
| `hooks/useManualDispatchAlert.js` | Update → `|| ev.data.is_deleted` dans la condition de retrait |
| `pages/livreur/CoursesDisponibles.jsx` | Create → risque faible, vérifier `!is_deleted` |

---

### Checklist de vérification rapide (régression)

```
□ 1. cancelCourseAction.js : isAdmin check inclut user.user_type === 'admin'
□ 2. cancelCourseAction.js : comparaison email → .toLowerCase().trim() sur les deux
□ 3. GererCourses subscription : if (event.data.is_deleted) → filter; else → map
□ 4. ActiveCourseSummary : !ev.data.is_deleted dans create ET update
□ 5. useDriverCourseAlert : STATUTS_INVALIDES dans fallback + clear sur update terminal
□ 6. useManualDispatchAlert : || ev.data.is_deleted dans la condition update
```

---

### Logs à chercher dans la console si le bug revient

```
[CANCEL_ACTION_ERROR] 403
[CANCEL_ACTION_ERROR] not owner
[REALTIME_PROPAGATED] subscription update ... is_deleted=true
[DRIVER_ALERT] Notification fallback showing course (course annulée ?)
```

---

### Cause racine structurelle (pourquoi ce bug revient souvent)

Le bug a deux dimensions indépendantes qui se cumulent :

1. **Dimension auth (backend)** : La vérification d'identité admin/client dans `cancelCourseAction` dépend de champs instables (`role` vs `user_type`, casse email). Chaque nouvelle version de l'APK ou de l'auth peut réintroduire un 403.

2. **Dimension realtime (frontend)** : Chaque subscription `Course.subscribe` est une source de réinjection potentielle. Quand une course est annulée/supprimée, plusieurs handlers independants reçoivent les events. Si UN SEUL oublie de vérifier `is_deleted` ou le statut terminal, la course fantôme réapparaît.

**Règle à respecter dans tout nouveau code utilisant `Course.subscribe` :**
```js
// TOUJOURS vérifier avant d'injecter dans l'état UI
if (ev.data.is_deleted) return prev.filter(c => c.id !== ev.id);
if (!ACTIVE_STATUTS.includes(ev.data.statut)) return prev.filter(c => c.id !== ev.id);
```

---

## 📌 Comment utiliser ce fichier

Si un bug similaire revient, AVANT de corriger :

1. Consulter ce fichier pour voir si c'est une régression connue
2. Utiliser `BugMemory.check('cancel_course')` en console navigateur
3. Suivre la checklist de vérification
4. Identifier quel fichier a été modifié récemment (cause probable)
5. Appliquer uniquement la correction ciblée

---

*Fichier à mettre à jour après chaque nouvelle correction.*  
*Code source : `lib/bugMemory.js`*