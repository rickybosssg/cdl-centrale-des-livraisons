import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Wallet, Users, Truck, Activity, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DIAGNOSTIC_TOOLS = [
  {
    id: "fcm",
    icon: Bell,
    title: "🔔 Diagnostic Notifications",
    description: "Vérifier l'état FCM, tester les notifications, diagnostic des tokens",
    path: "/fcm-diagnostic",
    color: "bg-blue-50 border-blue-200 text-blue-700"
  },
  {
    id: "bedou",
    icon: Wallet,
    title: "💰 Audit Bedou",
    description: "Vérifier l'intégrité des wallets, détecter les incohérences, recalculer les soldes",
    path: "/bedou-audit",
    color: "bg-green-50 border-green-200 text-green-700"
  },
  {
    id: "profiles",
    icon: Users,
    title: "👥 Vérification Profils",
    description: "Auditer les profils utilisateurs, documents, statuts de validation",
    path: "/gestion-profils",
    color: "bg-purple-50 border-purple-200 text-purple-700"
  },
  {
    id: "dispatch",
    icon: Truck,
    title: "🚚 Vérification Dispatch",
    description: "Surveiller l'état du dispatcher, vérifier les affectations, logs de dispatch",
    path: "/dispatch-monitor",
    color: "bg-amber-50 border-amber-200 text-amber-700"
  },
  {
    id: "health",
    icon: Activity,
    title: "⚕️ Santé Système",
    description: "Vérifier la santé globale du système, détection d'erreurs",
    path: "/health-dashboard",
    color: "bg-red-50 border-red-200 text-red-700"
  },
  {
    id: "audit",
    icon: AlertCircle,
    title: "📋 Audit Complet",
    description: "Audit global du système, vérifications multiples, rapports détaillés",
    path: "/audit-complet",
    color: "bg-indigo-50 border-indigo-200 text-indigo-700"
  }
];

export default function AdminDiagnostics() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">🛠️ Outils Diagnostics Admin</h1>
          <p className="text-sm text-muted-foreground">Accès rapide aux outils de maintenance et contrôle</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-semibold mb-1">Outils réservés aux administrateurs</p>
          <p className="text-xs">Ces pages permettent de diagnostiquer et corriger les problèmes système, monitorer les services, et vérifier l'intégrité des données.</p>
        </div>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 gap-4">
        {DIAGNOSTIC_TOOLS.map(tool => {
          const Icon = tool.icon;
          return (
            <Card key={tool.id} className={`border-2 cursor-pointer hover:shadow-lg transition-all ${tool.color}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="h-12 w-12 rounded-lg bg-white/50 flex items-center justify-center">
                      <Icon className="h-6 w-6" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm mb-1">{tool.title}</h3>
                    <p className="text-xs opacity-80 mb-3">{tool.description}</p>
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={() => navigate(tool.path)}
                    >
                      Accéder →
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick tips */}
      <div className="rounded-xl bg-muted/50 p-4 space-y-2 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground mb-2">💡 Conseils d'utilisation</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Utilisez Diagnostic Notifications pour tester les push notifications</li>
          <li>Lancez Audit Bedou régulièrement pour vérifier la cohérence des wallets</li>
          <li>Consultez Santé Système pour détecter les anomalies</li>
          <li>Utilisez Audit Complet pour un diagnostic global du système</li>
        </ul>
      </div>
    </div>
  );
}