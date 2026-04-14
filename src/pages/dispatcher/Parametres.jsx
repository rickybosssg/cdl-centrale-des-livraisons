import { useState, useEffect } from "react";
import SyncRolesButton from "@/components/SyncRolesButton";
import { ArrowLeft, Save, Trash2, AlertTriangle, ShieldAlert, Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
// getDispatchMode/setDispatchMode supprimés — mode géré via DispatchConfig BDD
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const STORAGE_KEY = "cdl_parametres";
const ALERTE_KEY = "cdl_alertes_config";

function getAlertesConfig() {
  try {
    const stored = localStorage.getItem(ALERTE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return { actif: true, seuil_courses: 3, ratio_seuil: 2, delai_min_minutes: 60 };
}

function getParams() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return {
    taux_commission: 20,
    delai_reponse_livreur: 30,
    seuil_alerte_commission: 5000,
    seuil_blocage_commission: 10000,
    blocage_auto: false,
    mode_dispatch: "auto",
  };
}

export default function Parametres() {
  const navigate = useNavigate();
  const [params, setParams] = useState(getParams());
  const [alertesConfig, setAlertesConfig] = useState(getAlertesConfig());
  const [alerteStatus, setAlerteStatus] = useState(null);
  const [testingAlerte, setTestingAlerte] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    base44.entities.DispatchConfig.list('-updated_date', 1).then(configs => {
      if (configs[0]) setParams(prev => ({ ...prev, mode_dispatch: configs[0].mode || 'auto' }));
    }).catch(() => {});
  }, []);

  const sauvegarderAlertes = () => {
    localStorage.setItem(ALERTE_KEY, JSON.stringify(alertesConfig));
    toast.success("Configuration alertes sauvegardée !");
  };

  const testerAlerte = async () => {
    setTestingAlerte(true);
    const res = await base44.functions.invoke('alerteLivreurs', { ...alertesConfig, dry_run: true });
    setAlerteStatus(res.data);
    setTestingAlerte(false);
    toast.info(res.data.dry_run ? `Test OK : ${res.data.courses_disponibles} courses, ${res.data.livreurs_en_ligne} livreurs en ligne` : `Ignoré : ${res.data.reason}`);
  };

  const lancerAlerteMaintenant = async () => {
    setTestingAlerte(true);
    const res = await base44.functions.invoke('alerteLivreurs', { ...alertesConfig, delai_min_minutes: 0 });
    setAlerteStatus(res.data);
    setTestingAlerte(false);
    if (res.data.success) toast.success(`✅ ${res.data.nb_alertes_envoyees} livreur(s) alerté(s) !`);
    else toast.info(`Ignoré : ${res.data.reason}`);
  };

  const updateAlerte = (key, value) => setAlertesConfig(prev => ({ ...prev, [key]: value }));

  const sauvegarder = async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    // Sauvegarder le mode dans DispatchConfig (source de vérité BDD)
    const configs = await base44.entities.DispatchConfig.list('-updated_date', 1);
    if (configs[0]) {
      const me = await base44.auth.me();
      await base44.entities.DispatchConfig.update(configs[0].id, {
        mode: params.mode_dispatch, force_override: true, last_changed_by: me?.email || 'admin',
      });
    }
    setSaved(true);
    toast.success("Paramètres sauvegardés !");
    setTimeout(() => setSaved(false), 2000);
  };

  const supprimerCompte = async () => {
    setDeleting(true);
    try {
      const user = await base44.auth.me();
      await base44.entities.User.delete(user.id);
      toast.success("Compte supprimé.");
      base44.auth.logout();
    } catch (e) {
      toast.error("Erreur lors de la suppression.");
    }
    setDeleting(false);
  };

  const update = (key, value) => setParams(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Paramètres</h1>
      </div>

      {/* Dispatch */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dispatch automatique</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Mode automatique</p>
              <p className="text-xs text-muted-foreground">Dispatch automatique sans intervention manuelle</p>
            </div>
            <Switch
              checked={params.mode_dispatch === "auto"}
              onCheckedChange={v => update("mode_dispatch", v ? "auto" : "manuel")}
            />
          </div>
          <div className="space-y-1">
            <Label>Délai de réponse du livreur (secondes)</Label>
            <Input
              type="number"
              value={params.delai_reponse_livreur}
              onChange={e => update("delai_reponse_livreur", parseInt(e.target.value) || 30)}
              min={10}
              max={120}
            />
            <p className="text-xs text-muted-foreground">Le livreur aura ce délai pour accepter ou refuser une course</p>
          </div>
        </CardContent>
      </Card>

      {/* Commissions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Commissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Taux de commission CDL (%)</Label>
            <Input
              type="number"
              value={params.taux_commission}
              onChange={e => update("taux_commission", parseInt(e.target.value) || 20)}
              min={1}
              max={50}
            />
          </div>
          <div className="space-y-1">
            <Label>Seuil d'alerte commission (FCFA)</Label>
            <Input
              type="number"
              value={params.seuil_alerte_commission}
              onChange={e => update("seuil_alerte_commission", parseInt(e.target.value) || 5000)}
            />
            <p className="text-xs text-muted-foreground">Au-delà de ce montant, le livreur sera signalé</p>
          </div>
          <div className="space-y-1">
            <Label>Seuil de blocage automatique (FCFA)</Label>
            <Input
              type="number"
              value={params.seuil_blocage_commission}
              onChange={e => update("seuil_blocage_commission", parseInt(e.target.value) || 10000)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Blocage automatique activé</p>
              <p className="text-xs text-muted-foreground">Bloquer automatiquement les livreurs dépassant le seuil</p>
            </div>
            <Switch
              checked={params.blocage_auto}
              onCheckedChange={v => update("blocage_auto", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Alertes livreurs */}
      <Card className="border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-600" />
            Alertes livreurs automatiques
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Système activé</p>
              <p className="text-xs text-muted-foreground">Envoyer des alertes automatiques aux livreurs</p>
            </div>
            <Switch checked={alertesConfig.actif} onCheckedChange={v => updateAlerte('actif', v)} />
          </div>
          <div className="space-y-1">
            <Label>Seuil de déclenchement (nombre de courses)</Label>
            <Input type="number" min={1} max={20}
              value={alertesConfig.seuil_courses}
              onChange={e => updateAlerte('seuil_courses', parseInt(e.target.value) || 3)} />
            <p className="text-xs text-muted-foreground">Alerte si ≥ ce nombre de courses en attente</p>
          </div>
          <div className="space-y-1">
            <Label>Ratio courses/livreurs pour déclencher</Label>
            <Input type="number" min={1} max={10} step={0.5}
              value={alertesConfig.ratio_seuil}
              onChange={e => updateAlerte('ratio_seuil', parseFloat(e.target.value) || 2)} />
            <p className="text-xs text-muted-foreground">Ex: 2 = alerte si 2x plus de courses que de livreurs</p>
          </div>
          <div className="space-y-1">
            <Label>Délai minimum entre deux alertes (minutes)</Label>
            <Input type="number" min={10} max={360}
              value={alertesConfig.delai_min_minutes}
              onChange={e => updateAlerte('delai_min_minutes', parseInt(e.target.value) || 60)} />
          </div>
          {alerteStatus && (
            <div className="p-3 rounded-xl bg-muted text-xs space-y-1">
              <p className="font-medium">Dernier test :</p>
              {alerteStatus.dry_run && <p>✅ Conditions remplies — {alerteStatus.courses_disponibles} courses, {alerteStatus.livreurs_en_ligne} livreurs en ligne, ratio {alerteStatus.ratio}</p>}
              {alerteStatus.skip && <p>⏭️ Ignoré : {alerteStatus.reason} {alerteStatus.prochaine_alerte_dans && `(prochaine dans ${alerteStatus.prochaine_alerte_dans})`}</p>}
              {alerteStatus.success && <p>📤 {alerteStatus.nb_alertes_envoyees} livreur(s) alerté(s) sur {alerteStatus.total_livreurs_valides}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-xs" onClick={testerAlerte} disabled={testingAlerte}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${testingAlerte ? 'animate-spin' : ''}`} /> Tester
            </Button>
            <Button className="flex-1 text-xs bg-amber-500 hover:bg-amber-600" onClick={lancerAlerteMaintenant} disabled={testingAlerte}>
              <Bell className="h-3.5 w-3.5 mr-1" /> Alerter maintenant
            </Button>
          </div>
          <Button variant="outline" className="w-full text-sm" onClick={sauvegarderAlertes}>
            <Save className="h-4 w-4 mr-2" /> Sauvegarder config alertes
          </Button>
        </CardContent>
      </Card>

      {/* Infos */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p>Ces paramètres sont stockés localement sur cet appareil.</p>
          <p>Version CDL Pro – Centrale des Livraisons Ouagadougou</p>
        </CardContent>
      </Card>

      {/* Audit utilisateurs */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 space-y-2">
          <Button variant="outline" className="w-full border-blue-300 text-blue-700" onClick={() => navigate('/audit-utilisateurs')}>
            <ShieldAlert className="h-4 w-4 mr-2" /> Audit utilisateurs
          </Button>
          <p className="text-xs text-blue-600 text-center">Détecter et réparer les comptes sans profil</p>
          <SyncRolesButton />
        </CardContent>
      </Card>

      <Button className="w-full" onClick={sauvegarder}>
        <Save className="h-4 w-4 mr-2" />
        {saved ? "Sauvegardé !" : "Sauvegarder les paramètres"}
      </Button>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Zone dangereuse
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer mon compte
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Supprimer mon compte
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Cette action est <strong>irréversible</strong>. Toutes vos données seront définitivement supprimées.
            </p>
            <p className="text-sm font-medium">Tapez <strong>SUPPRIMER</strong> pour confirmer :</p>
            <Input
              placeholder="SUPPRIMER"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setDeleteDialog(false); setConfirmText(""); }}>Annuler</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "SUPPRIMER" || deleting}
              onClick={supprimerCompte}
            >
              {deleting ? "Suppression..." : "Confirmer la suppression"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}