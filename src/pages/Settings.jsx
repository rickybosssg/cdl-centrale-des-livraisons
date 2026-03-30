import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const PROFILES = [
  { type: 'client', label: 'Client', emoji: '👤', color: 'text-blue-600' },
  { type: 'livreur', label: 'Livreur', emoji: '🛵', color: 'text-orange-600' },
  { type: 'partenaire', label: 'Partenaire', emoji: '🏪', color: 'text-green-600' },
  { type: 'commercial', label: 'Commercial', emoji: '📣', color: 'text-purple-600' },
];

const PROFILE_FIELDS = {
  client: { telephone: 'Téléphone', quartier: 'Quartier' },
  livreur: { telephone: 'Téléphone', quartier: 'Zone de travail', moyen_deplacement: 'Moyen de transport' },
  partenaire: { nom_commerce: 'Nom de la boutique', type_commerce: 'Type', telephone: 'Téléphone', adresse: 'Adresse' },
  commercial: { telephone: 'Téléphone', quartier: 'Zone' },
};

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogAdd, setDialogAdd] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const userProfiles = await base44.entities.UserProfile.filter({
        user_email: me.email,
        deleted: false,
      });
      setProfiles(userProfiles);
      setLoading(false);
    };
    load();
  }, []);

  const handleAddProfile = async () => {
    if (!selectedProfile || Object.keys(formData).length === 0) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }

    setSubmitting(true);
    try {
      const result = await base44.functions.invoke('addProfileToUser', {
        profile_type: selectedProfile,
        data: {
          ...formData,
          email: user.email,
          full_name: user.full_name,
        },
      });

      toast.success(result.status === 'actif' ? 'Profil activé !' : 'Demande envoyée à validation');
      setProfiles([...profiles, result.profile]);
      setDialogAdd(false);
      setSelectedProfile(null);
      setFormData({});

      // Refresh user
      const me = await base44.auth.me();
      setUser(me);
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchProfile = async (profileType) => {
    try {
      await base44.functions.invoke('switchActiveProfile', { profile_type: profileType });
      const me = await base44.auth.me();
      setUser(me);
      toast.success('Profil changé avec succès');
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Paramètres du compte</h1>
      </div>

      {/* Profil actif */}
      {user && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Profil actif</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{PROFILES.find(p => p.type === user.active_profile_type)?.emoji}</span>
              <div>
                <p className="font-bold text-lg">{PROFILES.find(p => p.type === user.active_profile_type)?.label}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tous les profils */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            Mes profils
            <Button size="sm" onClick={() => setDialogAdd(true)}>
              <Plus className="h-4 w-4 mr-1" />Ajouter
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucun profil</p>
          ) : (
            profiles.map(profile => {
              const config = PROFILES.find(p => p.type === profile.profile_type);
              const isActive = user?.active_profile_type === profile.profile_type;
              return (
                <div key={profile.id} className={`flex items-center justify-between p-3 rounded-lg border ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{config?.emoji}</span>
                    <div>
                      <p className="font-semibold text-sm">{config?.label}</p>
                      <div className="flex items-center gap-1">
                        {profile.status === 'actif' && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                        {profile.status === 'en_attente' && <span className="text-xs text-amber-600">⏳ En attente</span>}
                        {profile.status === 'refuse' && <XCircle className="h-3 w-3 text-red-600" />}
                        <span className="text-xs text-muted-foreground">{profile.status}</span>
                      </div>
                    </div>
                  </div>
                  {profile.status === 'actif' && (
                    <div className="flex gap-1">
                      {!isActive && (
                        <Button size="sm" variant="outline" onClick={() => handleSwitchProfile(profile.profile_type)}>
                          Utiliser
                        </Button>
                      )}
                      {isActive && <span className="text-xs font-bold text-primary px-3 py-1 rounded-full bg-primary/10">Actif</span>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Dialog ajouter profil */}
      <Dialog open={dialogAdd} onOpenChange={setDialogAdd}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter un profil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Choisir un profil *</Label>
              <Select value={selectedProfile || ''} onValueChange={setSelectedProfile}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un profil" />
                </SelectTrigger>
                <SelectContent>
                  {PROFILES.filter(p => !profiles.find(up => up.profile_type === p.type)).map(p => (
                    <SelectItem key={p.type} value={p.type}>
                      {p.emoji} {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProfile && (
              <div className="space-y-3 p-3 rounded-lg bg-muted">
                {Object.entries(PROFILE_FIELDS[selectedProfile] || {}).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs">{label} *</Label>
                    {key === 'moyen_deplacement' ? (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        {['moto', 'vehicule'].map(m => (
                          <button
                            key={m}
                            onClick={() => setFormData({ ...formData, [key]: m })}
                            className={`p-2 rounded-lg border text-xs font-medium ${
                              formData[key] === m ? 'border-primary bg-primary/10' : 'border-border'
                            }`}
                          >
                            {m === 'moto' ? '🛵' : '🚗'} {m}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Input
                        placeholder={`Entrez ${label.toLowerCase()}`}
                        value={formData[key] || ''}
                        onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogAdd(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={handleAddProfile} disabled={submitting}>
                {submitting ? 'Envoi...' : 'Ajouter le profil'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}