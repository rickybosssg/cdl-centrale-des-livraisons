import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { getDispatchMode, setDispatchMode } from "@/lib/dispatch";
import { toast } from "sonner";

const STORAGE_KEY = "cdl_parametres";

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
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setParams(prev => ({ ...prev, mode_dispatch: getDispatchMode() }));
  }, []);

  const sauvegarder = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    setDispatchMode(params.mode_dispatch);
    setSaved(true);
    toast.success("Paramètres sauvegardés !");
    setTimeout(() => setSaved(false), 2000);
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

      {/* Infos */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <p>Ces paramètres sont stockés localement sur cet appareil.</p>
          <p>Version CDL Pro – Centrale des Livraisons Ouagadougou</p>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={sauvegarder}>
        <Save className="h-4 w-4 mr-2" />
        {saved ? "Sauvegardé !" : "Sauvegarder les paramètres"}
      </Button>
    </div>
  );
}