import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, ChevronDown, ChevronUp, AlertTriangle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const SECTIONS = [
  {
    id: "build",
    emoji: "🏗️",
    title: "BUILD",
    items: [
      { id: "aab", label: "Générer un fichier AAB (Android App Bundle)" },
      { id: "versionCode", label: "versionCode supérieur à la version précédente" },
      { id: "versionName", label: "versionName mis à jour (ex: 1.0 → 1.1)" },
    ],
  },
  {
    id: "stabilite",
    emoji: "🛡️",
    title: "STABILITÉ",
    items: [
      { id: "nocrash", label: "Aucune page ne crash" },
      { id: "nav", label: "Navigation fluide entre toutes les pages" },
      { id: "notif_open", label: "Notifications fonctionnent — app ouverte (foreground)" },
      { id: "notif_bg", label: "Notifications fonctionnent — app en background" },
      { id: "notif_closed", label: "Notifications fonctionnent — app complètement fermée" },
      { id: "deeplink", label: "Deep link fonctionne : ouvre directement la bonne page" },
      { id: "deeplink_course", label: "Deep link /course/xxx → page course correcte" },
      { id: "deeplink_bedou", label: "Deep link /mon-bedou → page Bedou correcte" },
      { id: "deeplink_messages", label: "Deep link /mes-messages → page Messages correcte" },
      { id: "deeplink_signalement", label: "Deep link /gestion-signalements → page Signalements" },
    ],
  },
  {
    id: "permissions",
    emoji: "🔒",
    title: "PERMISSIONS",
    items: [
      { id: "perm_location", label: "Localisation justifiée (livraison en temps réel)" },
      { id: "perm_notif", label: "Notifications justifiées (courses / messages)" },
      { id: "perm_internet", label: "Internet : OK" },
      { id: "perm_nouseless", label: "Aucune permission inutile déclarée" },
    ],
  },
  {
    id: "fonctionnalites",
    emoji: "✅",
    title: "FONCTIONNALITÉS CLÉS",
    items: [
      { id: "signup", label: "Création de compte OK" },
      { id: "profile_client", label: "Profil Client : création et validation OK" },
      { id: "profile_livreur", label: "Profil Livreur : création et validation OK" },
      { id: "profile_partenaire", label: "Profil Partenaire : création et validation OK" },
      { id: "course_create", label: "Commande de course OK" },
      { id: "course_track", label: "Suivi course en temps réel OK" },
      { id: "course_accept", label: "Acceptation course côté livreur OK" },
      { id: "notif_all", label: "Notifications push OK (toutes les catégories)" },
      { id: "bedou", label: "Bedou : recharge / retrait / historique OK" },
      { id: "signalement", label: "Signalement problème OK" },
      { id: "admin_dash", label: "Admin dashboard OK" },
    ],
  },
  {
    id: "performance",
    emoji: "⚡",
    title: "PERFORMANCE",
    items: [
      { id: "load", label: "Temps de chargement rapide (< 3s)" },
      { id: "nofreeze", label: "Aucun freeze ou lag notable" },
      { id: "refresh", label: "Pull-to-refresh OK sur toutes les pages" },
      { id: "offline", label: "Message d'erreur correct si hors ligne" },
    ],
  },
  {
    id: "tests",
    emoji: "🧪",
    title: "TESTS APPAREILS",
    items: [
      { id: "apk_multi", label: "APK testé sur plusieurs modèles de téléphones" },
      { id: "test_closed_notif", label: "Test : app fermée + clic notification → bonne page" },
      { id: "test_livreur_accept", label: "Test : acceptation course livreur end-to-end" },
      { id: "test_admin", label: "Test : admin dashboard complet" },
      { id: "test_locked", label: "Test : téléphone verrouillé → notification visible + cliquable" },
    ],
  },
  {
    id: "securite",
    emoji: "🔐",
    title: "SÉCURITÉ",
    items: [
      { id: "data_isolation", label: "Chaque utilisateur voit uniquement ses données" },
      { id: "no_leak", label: "Aucune fuite d'information entre comptes" },
      { id: "admin_protected", label: "Pages admin protégées (DispatcherGuard)" },
      { id: "api_auth", label: "Toutes les fonctions backend vérifient l'authentification" },
    ],
  },
  {
    id: "final",
    emoji: "🚀",
    title: "FINAL",
    items: [
      { id: "screenshots", label: "Captures d'écran Play Store prises (min 4)" },
      { id: "description", label: "Description de l'app rédigée (FR)" },
      { id: "privacy_policy", label: "URL politique de confidentialité valide" },
      { id: "content_rating", label: "Classification du contenu complétée" },
      { id: "prod_ready", label: "App prête pour publication en production" },
    ],
  },
];

const STORAGE_KEY = "cdl_playstore_checklist";

function loadChecked() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function PlayStoreChecklist() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(loadChecked);
  const [collapsed, setCollapsed] = useState({});

  const toggle = (id) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleSection = (id) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const totalItems = SECTIONS.flatMap((s) => s.items).length;
  const doneItems = SECTIONS.flatMap((s) => s.items).filter((i) => checked[i.id]).length;
  const percent = Math.round((doneItems / totalItems) * 100);

  const allDone = doneItems === totalItems;

  const sectionDone = (s) => s.items.filter((i) => checked[i.id]).length;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Checklist Play Store CDL
          </h1>
          <p className="text-xs text-muted-foreground">Validation avant publication</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-red-500"
          onClick={() => {
            if (window.confirm("Réinitialiser toute la checklist ?")) {
              setChecked({});
              localStorage.removeItem(STORAGE_KEY);
            }
          }}
        >
          Reset
        </Button>
      </div>

      {/* Progression globale */}
      <div className="px-4">
        <Card className={allDone ? "border-green-400 bg-green-50" : "border-primary/30"}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm">Progression globale</p>
              <span className={`text-lg font-black ${allDone ? "text-green-600" : "text-primary"}`}>
                {percent}%
              </span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allDone ? "bg-green-500" : "bg-primary"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {doneItems} / {totalItems} éléments validés
            </p>
            {allDone && (
              <div className="text-center text-green-700 font-bold text-sm flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                🎉 Application prête pour le Play Store !
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sections */}
      <div className="px-4 space-y-3">
        {SECTIONS.map((section) => {
          const done = sectionDone(section);
          const total = section.items.length;
          const sectionComplete = done === total;
          const isCollapsed = collapsed[section.id];

          return (
            <Card
              key={section.id}
              className={sectionComplete ? "border-green-300 bg-green-50/30" : ""}
            >
              <CardContent className="p-0">
                {/* Section header */}
                <button
                  className="w-full flex items-center gap-3 p-4 text-left"
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="text-xl">{section.emoji}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{done}/{total} validés</p>
                  </div>
                  {sectionComplete ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  ) : done > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  ) : null}
                  {isCollapsed ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {/* Items */}
                {!isCollapsed && (
                  <div className="border-t divide-y">
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                        onClick={() => toggle(item.id)}
                      >
                        {checked[item.id] ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-sm leading-snug ${
                            checked[item.id] ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}