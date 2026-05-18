/**
 * AssignDriverModal — Modal global d'assignation de livreur
 *
 * Utilisation :
 *   <AssignDriverModal
 *     course={course}           // objet course sélectionnée
 *     open={boolean}
 *     onClose={() => {}}        // fermer le modal
 *     onDone={() => {}}         // callback après assignation réussie
 *   />
 *
 * Ce modal est LA SEULE interface d'assignation manuelle.
 * Il appelle uniquement assignCourseAction (source unique).
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Zap, Star, MapPin, RefreshCw, Loader2, Users } from "lucide-react";
import moment from "moment";

// ── Helpers géo ──────────────────────────────────────────────────────────────
const ZONES_PROCHES = {
  "Ouaga 2000": ["Patte d'Oie", "Zone 1", "Kossodo", "Pissy"],
  "Zone 1": ["Koulouba", "Zogona", "Gounghin", "Ouaga 2000"],
  "Cissin": ["Karpala", "Wemtenga", "Dassasgho", "Zone 1"],
  "Karpala": ["Cissin", "Wemtenga", "Balkuy", "Dassasgho"],
  "Pissy": ["Gounghin", "Patte d'Oie", "Somgandé", "Ouaga 2000"],
  "Gounghin": ["Zone 1", "Pissy", "Zogona", "Tanghin"],
  "Tampouy": ["Tanghin", "Zogona", "Nagrin", "Koulouba"],
  "Tanghin": ["Tampouy", "Zogona", "Koulouba", "Gounghin"],
  "Zogona": ["Zone 1", "Tanghin", "Gounghin", "Koulouba"],
  "Koulouba": ["Zone 1", "Tanghin", "Zogona", "Tampouy"],
  "Kossodo": ["Ouaga 2000", "Nagrin", "Tampouy"],
  "Wemtenga": ["Cissin", "Karpala", "Dassasgho"],
  "Balkuy": ["Karpala", "Dassasgho", "Wemtenga"],
  "Dassasgho": ["Cissin", "Wemtenga", "Balkuy", "Karpala"],
  "Patte d'Oie": ["Ouaga 2000", "Pissy", "Somgandé"],
  "Somgandé": ["Patte d'Oie", "Pissy", "Ouaga 2000"],
  "Nagrin": ["Kossodo", "Tampouy", "Tanghin"],
};

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreDriver(driver, course) {
  let score = 0;
  let distLabel = null;

  if (driver.gps_latitude && driver.gps_longitude && course?.latitude_depart && course?.longitude_depart) {
    const d = distKm(driver.gps_latitude, driver.gps_longitude, course.latitude_depart, course.longitude_depart);
    distLabel = d < 1 ? `< 1 km` : `${d.toFixed(1)} km`;
    score += Math.max(0, 50 - d * 5);
  }

  if (driver.quartier === course?.quartier_depart) {
    score += 40;
    distLabel = distLabel || "Même zone";
  } else if (ZONES_PROCHES[course?.quartier_depart]?.includes(driver.quartier)) {
    score += 20;
    distLabel = distLabel || "Zone proche";
  }

  score += (driver.note_moyenne || 0) * 2;
  score -= (driver.nombre_courses_actives || 0) * 10;

  return { ...driver, _score: score, _distLabel: distLabel };
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function AssignDriverModal({ course, open, onClose, onDone }) {
  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [assigning, setAssigning] = useState(null); // email du livreur en cours
  const [autoDispatching, setAutoDispatching] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
    loadDrivers();
  }, [open]);

  const loadDrivers = async () => {
    setLoadingDrivers(true);
    try {
      const allUsers = await base44.entities.User.list('-updated_date', 300);
      const available = allUsers.filter(u =>
        u.driver_online === true &&
        u.profil_valide === true &&
        !u.livreur_bloque &&
        !u.livreur_suspendu &&
        (u.nombre_courses_actives || 0) < 2
      );
      const scored = available.map(d => scoreDriver(d, course)).sort((a, b) => b._score - a._score);
      setDrivers(scored);
    } catch (e) {
      toast.error("Erreur chargement livreurs");
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleManualAssign = async (driver) => {
    if (assigning) return;
    setAssigning(driver.email);
    try {
      const res = await base44.functions.invoke('assignCourseAction', {
        course_id: course.id,
        mode: 'manual',
        driver_email: driver.email,
      });
      if (res?.data?.success) {
        toast.success(`✅ Course assignée à ${driver.full_name}`);
        onClose();
        onDone?.();
      } else {
        toast.error(res?.data?.reason || res?.data?.error || "Erreur assignation");
      }
    } catch (e) {
      toast.error("Erreur : " + (e?.message || "réessayez"));
    } finally {
      setAssigning(null);
    }
  };

  const handleAutoDispatch = async () => {
    setAutoDispatching(true);
    try {
      const res = await base44.functions.invoke('assignCourseAction', {
        course_id: course.id,
        mode: 'auto',
      });
      if (res?.data?.success) {
        toast.success(`🚀 Auto-dispatch : ${res.data.livreur?.nom}`);
        onClose();
        onDone?.();
      } else {
        toast.error(res?.data?.reason || "Aucun livreur disponible");
      }
    } catch (e) {
      toast.error("Erreur auto-dispatch : " + (e?.message || "réessayez"));
    } finally {
      setAutoDispatching(false);
    }
  };

  const handleRedispatch = async () => {
    setAutoDispatching(true);
    try {
      const res = await base44.functions.invoke('assignCourseAction', {
        course_id: course.id,
        mode: 'redispatch',
      });
      if (res?.data?.success) {
        toast.success(`🔄 Re-dispatch : ${res.data.livreur?.nom}`);
        onClose();
        onDone?.();
      } else {
        toast.error(res?.data?.reason || "Aucun livreur disponible");
      }
    } catch (e) {
      toast.error("Erreur re-dispatch : " + (e?.message || "réessayez"));
    } finally {
      setAutoDispatching(false);
    }
  };

  if (!course) return null;

  const recommended = drivers.filter(d => d._score > 0).slice(0, 3);
  const others = drivers.filter(d => d._score <= 0 || !recommended.find(r => r.id === d.id));
  const filteredOthers = search
    ? drivers.filter(d => d.full_name?.toLowerCase().includes(search.toLowerCase()) || d.quartier?.toLowerCase().includes(search.toLowerCase()))
    : others;

  const waitMin = Math.round((Date.now() - new Date(course.created_date).getTime()) / 60000);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Assigner un livreur
          </DialogTitle>
        </DialogHeader>

        {/* Résumé course */}
        <div className="p-3 rounded-xl bg-muted/40 text-sm space-y-1">
          <p className="font-semibold">{course.quartier_depart} → {course.quartier_arrivee}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="font-bold text-primary">{course.prix || 0} FCFA</span>
            <span>{course.type_colis}</span>
            <span className={waitMin > 15 ? "text-red-600 font-bold" : waitMin > 5 ? "text-amber-600" : "text-green-600"}>
              ⏱ {waitMin < 1 ? "< 1min" : `${waitMin}min`} d'attente
            </span>
          </div>
        </div>

        {/* Boutons dispatch automatique */}
        <div className="flex gap-2">
          <Button
            className="flex-1 h-9 text-sm bg-primary"
            onClick={handleAutoDispatch}
            disabled={autoDispatching || !!assigning}
          >
            {autoDispatching ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
            Auto-dispatch
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-9 text-sm"
            onClick={handleRedispatch}
            disabled={autoDispatching || !!assigning}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Re-dispatch
          </Button>
        </div>

        {/* Séparateur */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          <span>ou choisir manuellement</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {loadingDrivers ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Recommandés */}
            {recommended.length > 0 && (
              <div>
                <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1">
                  <Star className="h-3 w-3" /> Recommandés
                </p>
                <div className="space-y-2">
                  {recommended.map((d, i) => (
                    <DriverRow
                      key={d.id}
                      driver={d}
                      rank={i + 1}
                      recommended
                      onAssign={() => handleManualAssign(d)}
                      loading={assigning === d.email}
                      disabled={!!assigning || autoDispatching}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Recherche + autres */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Tous les livreurs ({drivers.length} disponibles)
                </p>
                <button onClick={loadDrivers} className="text-xs text-primary hover:underline">
                  Actualiser
                </button>
              </div>
              <input
                type="text"
                placeholder="Rechercher par nom ou quartier…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredOthers.map(d => (
                  <DriverRow
                    key={d.id}
                    driver={d}
                    onAssign={() => handleManualAssign(d)}
                    loading={assigning === d.email}
                    disabled={!!assigning || autoDispatching}
                  />
                ))}
                {filteredOthers.length === 0 && !recommended.length && (
                  <p className="text-center text-sm text-muted-foreground py-4">
                    Aucun livreur disponible en ce moment
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DriverRow({ driver, rank, recommended, onAssign, loading, disabled }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${
      recommended ? "border-green-200 bg-green-50" : "border-border hover:bg-muted/30"
    }`}>
      <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
        recommended ? "bg-green-200 text-green-800" : "bg-muted text-muted-foreground"
      }`}>
        {rank ? rank : driver.full_name?.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{driver.full_name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 flex-shrink-0" />
          <span>{driver._distLabel || driver.quartier || "—"}</span>
          <span>·</span>
          <span className={(driver.nombre_courses_actives || 0) > 0 ? "text-amber-600" : "text-green-600"}>
            {driver.nombre_courses_actives || 0} active{(driver.nombre_courses_actives || 0) !== 1 ? "s" : ""}
          </span>
          {driver.note_moyenne > 0 && (
            <>
              <span>·</span>
              <span>⭐ {driver.note_moyenne?.toFixed(1)}</span>
            </>
          )}
        </div>
      </div>
      <Button
        size="sm"
        className={`h-8 text-xs flex-shrink-0 ${recommended ? "bg-green-600 hover:bg-green-700" : ""}`}
        variant={recommended ? "default" : "outline"}
        onClick={onAssign}
        disabled={disabled}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : (
          <><Zap className="h-3 w-3 mr-1" />Affecter</>
        )}
      </Button>
    </div>
  );
}