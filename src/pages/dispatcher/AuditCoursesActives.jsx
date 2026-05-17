/**
 * AuditCoursesActives — Audit et correction des faux "occupés"
 * Route : /admin/audit-courses-actives
 * Admin only
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Wrench } from "lucide-react";
import { toast } from "sonner";
import moment from "moment";

const ACTIVE_STATUTS = new Set([
  'assignee_attente', 'acceptee', 'driver_en_route_pickup',
  'arrived_pickup', 'en_cours', 'arrived_dropoff',
]);

const STALE_STATUTS = new Set([
  'livree', 'annulee', 'refusee', 'aucun_livreur', 'echec_dispatch',
]);

export default function AuditCoursesActives() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [cleanupResult, setCleanupResult] = useState(null);

  // Audit local (lecture seule) — directement depuis le frontend
  const runLocalAudit = async () => {
    setLoading(true);
    setResult(null);
    try {
      // Charger toutes les courses récentes
      const [allCourses, allUsers] = await Promise.all([
        base44.entities.Course.list('-created_date', 500),
        base44.entities.User.list('-updated_date', 500),
      ]);

      // Calculer les vrais compteurs
      const realCounts = {};
      const ghostCourses = [];

      for (const c of allCourses) {
        const email = c.livreur_email;
        if (!email || email.trim() === '') continue;
        if (ACTIVE_STATUTS.has(c.statut)) {
          realCounts[email] = (realCounts[email] || 0) + 1;
        } else if (STALE_STATUTS.has(c.statut)) {
          ghostCourses.push(c);
        }
      }

      // Trouver les divergences
      const divergences = [];
      const ok = [];

      for (const u of allUsers) {
        if (!u.email) continue;
        const real = realCounts[u.email] || 0;
        const stored = u.nombre_courses_actives || 0;
        if (stored !== real) {
          divergences.push({
            id: u.id,
            email: u.email,
            nom: u.full_name,
            stored,
            real,
            delta: real - stored,
            driver_online: u.driver_online,
            faux_occupe: stored > real,
          });
        } else if (stored > 0 || u.driver_online) {
          ok.push({ email: u.email, nom: u.full_name, count: real });
        }
      }

      // Vrais occupés actuels
      const vraiOccupes = allUsers.filter(u => (realCounts[u.email] || 0) >= 2);
      const fauxOccupes = divergences.filter(d => d.faux_occupe);

      setResult({
        courses_analysed: allCourses.length,
        drivers_total: allUsers.length,
        divergences,
        faux_occupes: fauxOccupes,
        vrais_occupes: vraiOccupes,
        ghost_courses: ghostCourses,
        real_counts: realCounts,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      toast.error('Erreur audit: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Cleanup backend (corrige en BDD)
  const runCleanup = async () => {
    setCleanupLoading(true);
    try {
      const res = await base44.functions.invoke('cleanupStaleAssignments', {});
      if (res.data?.success) {
        setCleanupResult(res.data);
        toast.success(`✅ ${res.data.summary?.corrections_made} correction(s) appliquées`);
        // Relancer l'audit local pour voir les nouvelles valeurs
        setTimeout(runLocalAudit, 1000);
      } else {
        toast.error(res.data?.error || 'Erreur cleanup');
      }
    } catch (err) {
      toast.error('Erreur: ' + err.message);
    } finally {
      setCleanupLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-16 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🔍 Audit — Courses actives</h1>
          <p className="text-xs text-muted-foreground">Détecte et corrige les faux "occupés"</p>
        </div>
      </div>

      {/* Explication */}
      <Card className="border-amber-300 bg-amber-50">
        <CardContent className="p-4 text-xs space-y-1.5 text-amber-800">
          <p className="font-bold text-sm">⚠️ Problème détecté</p>
          <p>Le compteur <code>nombre_courses_actives</code> sur User est un compteur optimiste qui peut dériver si une course est annulée/livrée sans décrémentation propre.</p>
          <p className="font-semibold mt-2">Un livreur est "occupé" UNIQUEMENT si une course réelle avec statut actif lui est assignée :</p>
          <p className="font-mono bg-amber-100 px-2 py-1 rounded text-[11px]">
            assignee_attente | acceptee | driver_en_route_pickup | arrived_pickup | en_cours | arrived_dropoff
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={runLocalAudit} disabled={loading} className="h-12">
          {loading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Audit...</>
          ) : (
            <><RefreshCw className="h-4 w-4 mr-2" />Analyser</>
          )}
        </Button>
        <Button
          onClick={runCleanup}
          disabled={cleanupLoading}
          className="h-12 bg-orange-500 hover:bg-orange-600 text-white"
        >
          {cleanupLoading ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Correction...</>
          ) : (
            <><Wrench className="h-4 w-4 mr-2" />Corriger BDD</>
          )}
        </Button>
      </div>

      {/* Résultat cleanup backend */}
      {cleanupResult && (
        <Card className="border-green-400 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800">✅ Résultat correction BDD</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1 font-mono">
            <p>Courses analysées : <strong>{cleanupResult.summary?.courses_analysed}</strong></p>
            <p>Livreurs vérifiés : <strong>{cleanupResult.summary?.drivers_checked}</strong></p>
            <p className="text-green-700 font-bold">Corrections appliquées : {cleanupResult.summary?.corrections_made}</p>
            <p>Courses fantômes trouvées : {cleanupResult.summary?.ghost_courses_found}</p>
            <p className="text-muted-foreground">{moment(new Date()).fromNow()}</p>
          </CardContent>
        </Card>
      )}

      {/* Résultat audit */}
      {result && (
        <div className="space-y-4">
          {/* Résumé */}
          <div className="grid grid-cols-2 gap-2">
            <Card className={`border-l-4 ${result.faux_occupes.length > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
              <CardContent className="p-3 text-center">
                <p className={`text-3xl font-bold ${result.faux_occupes.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {result.faux_occupes.length}
                </p>
                <p className="text-[10px] text-muted-foreground">Faux occupés</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-3 text-center">
                <p className="text-3xl font-bold text-amber-600">{result.ghost_courses.length}</p>
                <p className="text-[10px] text-muted-foreground">Courses fantômes</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-3 text-center">
                <p className="text-3xl font-bold text-blue-600">{result.divergences.length}</p>
                <p className="text-[10px] text-muted-foreground">Divergences total</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-3 text-center">
                <p className="text-3xl font-bold text-purple-600">{result.vrais_occupes.length}</p>
                <p className="text-[10px] text-muted-foreground">Vrais occupés</p>
              </CardContent>
            </Card>
          </div>

          {/* Faux occupés — critique */}
          {result.faux_occupes.length > 0 && (
            <Card className="border-red-400">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Livreurs faussement "occupés" ({result.faux_occupes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.faux_occupes.map((d) => (
                  <div key={d.email} className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200">
                    <div>
                      <p className="text-sm font-bold text-red-800">{d.nom || d.email}</p>
                      <p className="text-xs text-red-600">{d.email}</p>
                      {d.driver_online && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">En ligne</span>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono">
                        <span className="text-red-600 font-bold">Stocké: {d.stored}</span>
                        {' → '}
                        <span className="text-green-600 font-bold">Réel: {d.real}</span>
                      </p>
                      <p className="text-[10px] text-red-500">Delta: {d.delta > 0 ? '+' : ''}{d.delta}</p>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-center text-red-600 font-semibold">
                  Cliquez "Corriger BDD" pour appliquer les corrections
                </p>
              </CardContent>
            </Card>
          )}

          {/* Vrais occupés */}
          {result.vrais_occupes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-amber-500" />
                  Vrais occupés ({result.vrais_occupes.length}) — occupés légitimement
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {result.vrais_occupes.map((d) => (
                  <div key={d.email} className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="text-xs font-medium">{d.full_name || d.email}</span>
                    <span className="text-xs font-bold text-amber-700">
                      {result.real_counts[d.email] || 0} course(s) active(s)
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Courses fantômes */}
          {result.ghost_courses.length > 0 && (
            <Card className="border-orange-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-orange-700 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Courses fantômes ({result.ghost_courses.length}) — livreur_email présent mais statut terminal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 max-h-60 overflow-y-auto">
                {result.ghost_courses.slice(0, 30).map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
                    <div>
                      <p className="text-xs font-semibold">{c.quartier_depart} → {c.quartier_arrivee}</p>
                      <p className="text-[10px] text-orange-600">{c.livreur_email} · {moment(c.created_date).fromNow()}</p>
                    </div>
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                      {c.statut}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.faux_occupes.length === 0 && result.divergences.length === 0 && (
            <Card className="border-green-400 bg-green-50">
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                <p className="font-bold text-green-800">Tout est correct !</p>
                <p className="text-xs text-green-600">Aucune divergence détectée. Tous les compteurs sont cohérents.</p>
              </CardContent>
            </Card>
          )}

          <p className="text-[10px] text-center text-muted-foreground">
            Analysé le {moment(result.ts).format('DD/MM/YY HH:mm:ss')} · {result.courses_analysed} courses · {result.drivers_total} livreurs
          </p>
        </div>
      )}
    </div>
  );
}