/**
 * notificationRouter.js
 * Logique centralisée de deep-link pour toutes les notifications CDL.
 * 
 * Priorité de résolution :
 * 1. target_screen (champ explicite stocké en base) → route directe
 * 2. course_id + rôle destinataire → route cours spécifique
 * 3. target_entity_type + target_entity_id → route entité
 * 4. Heuristique titre/rôle → fallback lisible
 */

export function resolveNotifRoute(notif) {
  if (!notif) return null;

  const role = notif.destinataire_role || "";
  const titre = (notif.titre || "").toLowerCase();
  const courseId = notif.course_id || notif.target_entity_id;
  const entityType = notif.target_entity_type || "";
  const entityId = notif.target_entity_id || "";

  // ── 1. Route explicite stockée → priorité absolue ─────────────────────────
  if (notif.target_screen) return notif.target_screen;

  // ── 2. Course ID selon rôle ────────────────────────────────────────────────
  if (courseId && (entityType === "course" || notif.course_id)) {
    if (role === "livreur") {
      // Si assignée_attente → courses disponibles pour accepter
      if (titre.includes("nouvelle course") || titre.includes("attribu")) {
        return "/courses-disponibles";
      }
      return `/course-livreur/${courseId}`;
    }
    if (role === "client") return `/course/${courseId}`;
    if (role === "admin") return `/gerer-courses`;
  }

  // ── 3. Entité typée ───────────────────────────────────────────────────────
  if (entityType && entityId) {
    switch (entityType) {
      case "commande":
        if (role === "partenaire") return `/commandes-partenaire`;
        if (role === "client") return `/commande-marketplace/${entityId}`;
        return null;
      case "profil":
        if (role === "livreur" || role === "commercial" || role === "partenaire") return "/settings";
        if (role === "admin") return `/admin/profil/${entityId}`;
        return null;
      case "transaction":
        return "/mon-bedou";
      case "publicite":
        if (role === "annonceur") return "/dashboard-annonceur";
        if (role === "admin") return "/gerer-publicites";
        return null;
      default:
        break;
    }
  }

  // ── 4. Heuristiques titre + rôle ──────────────────────────────────────────

  // LIVREUR
  if (role === "livreur") {
    if (titre.includes("nouvelle course") || titre.includes("attribu")) return "/courses-disponibles";
    if (titre.includes("course") || titre.includes("livraison")) return "/mes-livraisons";
    if (titre.includes("gain") || titre.includes("commission") || titre.includes("recharge") || titre.includes("retrait") || titre.includes("bedou")) return "/mes-gains";
    if (titre.includes("validé") || titre.includes("profil") || titre.includes("compte") || titre.includes("refusé") || titre.includes("document")) return "/settings";
    if (titre.includes("message")) return "/mes-discussions";
    return "/courses-disponibles";
  }

  // CLIENT
  if (role === "client") {
    if (titre.includes("course") || titre.includes("livraison") || titre.includes("livreur")) return "/mes-courses";
    if (titre.includes("commande") || titre.includes("marketplace") || titre.includes("mall")) return "/mes-commandes-marketplace";
    if (titre.includes("bedou") || titre.includes("recharge") || titre.includes("retrait") || titre.includes("solde")) return "/mon-bedou";
    if (titre.includes("message")) return "/mes-messages";
    return "/mes-courses";
  }

  // PARTENAIRE
  if (role === "partenaire") {
    if (titre.includes("commande")) return "/commandes-partenaire";
    if (titre.includes("gain") || titre.includes("bedou") || titre.includes("retrait")) return "/mon-bedou";
    if (titre.includes("profil") || titre.includes("validé") || titre.includes("refusé") || titre.includes("suspendu")) return "/settings";
    if (titre.includes("message")) return "/mes-messages";
    return "/dashboard-partenaire";
  }

  // COMMERCIAL
  if (role === "commercial") {
    if (titre.includes("gain") || titre.includes("bedou") || titre.includes("bonus") || titre.includes("crédit") || titre.includes("parrainage")) return "/mon-bedou";
    if (titre.includes("code") || titre.includes("promo") || titre.includes("client")) return "/";
    if (titre.includes("validé") || titre.includes("profil") || titre.includes("refusé")) return "/settings";
    if (titre.includes("retrait")) return "/mon-bedou";
    return "/";
  }

  // ANNONCEUR
  if (role === "annonceur") {
    if (titre.includes("publicité") || titre.includes("pub") || titre.includes("annonce") || titre.includes("validé") || titre.includes("refusé")) return "/dashboard-annonceur";
    return "/dashboard-annonceur";
  }

  // ADMIN
  if (role === "admin") {
    if (titre.includes("livreur") && (titre.includes("inscrit") || titre.includes("document") || titre.includes("profil") || titre.includes("validation"))) return "/gestion-profils";
    if (titre.includes("course") || titre.includes("livraison") || titre.includes("dispatch")) return "/gerer-courses";
    if (titre.includes("retrait") || titre.includes("recharge") || titre.includes("bedou") || titre.includes("transaction")) return "/gestion-transactions";
    if (titre.includes("commercial") || titre.includes("code promo")) return "/gerer-commerciaux";
    if (titre.includes("partenaire")) return "/gerer-partenaires";
    if (titre.includes("client")) return "/gerer-clients";
    if (titre.includes("publicité") || titre.includes("pub") || titre.includes("annonceur")) return "/gerer-publicites";
    if (titre.includes("profil") || titre.includes("inscrit") || titre.includes("demande")) return "/gestion-profils";
    if (titre.includes("message")) return "/messages-admin";
    return "/admin-dashboard";
  }

  // Fallback universel
  if (courseId) return role === "livreur" ? `/course-livreur/${courseId}` : `/course/${courseId}`;
  return null;
}

/**
 * Texte du bouton d'action selon la route et le rôle
 */
export function resolveActionLabel(route, role) {
  if (!route) return null;
  if (route.includes("/course-livreur/")) return "Voir la course →";
  if (route.includes("/course/")) return "Suivre la course →";
  if (route === "/courses-disponibles") return "Voir les courses disponibles →";
  if (route === "/mes-livraisons") return "Mes livraisons →";
  if (route.includes("/commande")) return "Voir la commande →";
  if (route === "/mon-bedou") return "Voir mon Bedou →";
  if (route === "/mes-gains") return "Voir mes gains →";
  if (route === "/settings") return "Voir mon profil →";
  if (route === "/gestion-profils") return "Gérer les profils →";
  if (route === "/gerer-courses") return "Gérer les courses →";
  if (route === "/gestion-transactions") return "Gérer les transactions →";
  if (route === "/dashboard-annonceur") return "Mon tableau de bord →";
  if (route === "/admin-dashboard") return "Tableau de bord →";
  return "Voir les détails →";
}