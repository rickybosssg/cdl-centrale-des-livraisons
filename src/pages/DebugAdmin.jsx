import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";

export default function DebugAdmin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      setUser(me);
    } catch (err) {
      toast.error("Erreur chargement user: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleFixAdmin = async () => {
    if (!user?.email) {
      toast.error("Aucun utilisateur chargé");
      return;
    }

    setFixing(true);
    try {
      const res = await base44.functions.invoke('forceAdminRole', {
        target_email: user.email,
      });

      if (res.data?.success) {
        toast.success('✅ Rôle admin forcé! Rechargement complet...');
        // Vider TOUT le localStorage/sessionStorage pour forcer un refetch complet
        try {
          localStorage.clear();
          sessionStorage.clear();
          // Attendre que le cache soit clair, puis reload
          setTimeout(() => {
            window.location.href = '/';
          }, 1000);
        } catch (e) {
          // Si clear échoue, juste reload
          setTimeout(() => {
            window.location.href = '/';
          }, 500);
        }
      } else {
        toast.error(res.data?.error || 'Erreur');
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    }
    setFixing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = user?.role === 'admin' || user?.user_type === 'admin';

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Debug Rôle Admin
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* État actuel */}
            <div className="space-y-2 p-3 rounded-lg bg-slate-50 border">
              <p className="text-xs font-semibold text-muted-foreground">État actuel en base :</p>
              <div className="space-y-1 text-sm font-mono text-foreground">
                <p><span className="text-muted-foreground">Email:</span> {user?.email}</p>
                <p><span className="text-muted-foreground">user.role:</span> <span className={isAdmin ? 'text-green-600 font-bold' : 'text-red-600'}>{user?.role || 'null'}</span></p>
                <p><span className="text-muted-foreground">user_type:</span> {user?.user_type || 'null'}</p>
                <p><span className="text-muted-foreground">active_profile_type:</span> {user?.active_profile_type || 'null'}</p>
              </div>
            </div>

            {/* Résumé */}
            {isAdmin ? (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700">
                  <p className="font-semibold">✅ Vous êtes admin!</p>
                  <p className="text-xs mt-1">Actualisez la page pour voir les changements.</p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-700">⚠️ Rôle admin NON détecté</p>
                <p className="text-xs text-red-600 mt-1">Cliquez ci-dessous pour corriger.</p>
              </div>
            )}

            {/* Bouton de correction */}
            {user?.email === 'weezyh2@gmail.com' && !isAdmin && (
              <Button
                onClick={handleFixAdmin}
                disabled={fixing}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {fixing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Correction en cours...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Forcer rôle admin maintenant
                  </>
                )}
              </Button>
            )}

            {/* Bouton refetch */}
            <Button
              onClick={loadUser}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Recharger les données
            </Button>

            {/* Info */}
            <div className="text-[10px] text-muted-foreground text-center p-2 rounded-lg bg-muted">
              Cette page affiche l'état RÉEL en base de données.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}