import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, XCircle, Shield, FileText,
  LogOut, User, Truck, Store, Megaphone, RefreshCw, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const PROFILES = [
  {
    type: 'client', label: 'Client', emoji: '👤',
    icon: User, color: 'bg-blue-100 text-blue-700',
    desc: 'Commandez des livraisons et déplacements',
    immediate: true,
    fields: { telephone: 'Téléphone', quartier: 'Quartier' },
  },
  {
    type: 'livreur', label: 'Livreur', emoji: '\uD83D\uDEF5',
    icon: Truck, color: 'bg-green-100 text-green-700',
    desc: 'Effectuez des livraisons — soumis à validation',
    immediate: false,
    fields: { telephone: 'Téléphone', quartier: 'Zone de travail' },
    extra: 'moyen_deplacement', // champ spécial géré séparément
  },
  {
    type: 'partenaire', label: 'Partenaire', emoji: '🏪',
    icon: Store, color: 'bg-purple-100 text-purple-700',
    desc: 'Proposez vos produits sur CDL — soumis à validation',
    immediate: false,
    fields: { nom_commerce: 'Nom de la boutique', type_commerce: 'Type de commerce', telephone: 'Téléphone', adresse: 'Adresse' },
  },
  {
    type: 'commercial', label: 'Commercial', emoji: '📣',
    icon: Megaphone, color: 'bg-orange-100 text-orange-700',
    desc: 'Recrutez des clients via votre code promo — soumis à validation',
    immediate: false,
    fields: { telephone: 'Téléphone', quartier: 'Zone' },
  },
];

const STATUT_CFG = {
  actif:       { label: 'Actif',      class: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  en_attente:  { label: 'En attente', class: 'bg-amber-100 text-amber-700',  icon: null },
  refuse:      { label: 'Refusé',     class: 'bg-red-100 text-red-700',     icon: XCircle },
  suspendu:    { label: 'Suspendu',   class: 'bg-gray-100 text-gray-600',   icon: Lock },
};

export default function Settings() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogAdd, setDialogAdd] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [formData, setFormData] = useState({});
  const [moyenDeplacement, setMoyenDeplacement] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(null);

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

  useEffect(() => { load(); }, []);

  const activeProfileType = user?.active_profile_type || user?.user_type;

  const handleAddProfile = async () => {
    if (!selectedProfile) return toast.error('Choisissez un profil');
    const cfg = PROFILES.find(p => p.type === selectedProfile);
    const missing = Object.keys(cfg.fields).filter(k => !formData[k]);
    if (missing.length > 0) return toast.error('Veuillez remplir tous les champs obligatoires : ' + missing.join(', '));
    if (selectedProfile === 'livreur' && moyenDeplacement.length === 0) {
      return toast.error('Veuillez sélectionner au moins un mode de déplacement');
    }

    const payload = { ...formData, email: user.email, full_name: user.full_name };
    if (selectedProfile === 'livreur') payload.moyen_deplacement = JSON.stringify(moyenDeplacement);

    console.log('[AddProfile] Envoi:', selectedProfile, payload);
    setSubmitting(true);
    try {
      const result = await base44.functions.invoke('addProfileToUser', {
        profile_type: selectedProfile,
        data: payload,
      });
      console.log('[AddProfile] Réponse:', result.data);
      setSubmitting(false);
      if (result.data?.success) {
        toast.success(result.data.status === 'actif' ? '✅ Profil activé !' : '⏳ Demande envoyée à l\'admin');
        setDialogAdd(false);
        setSelectedProfile(null);
        setFormData({});
        setMoyenDeplacement([]);
        await load();
      } else {
        const msg = result.data?.error || 'Erreur lors de la création';
        if (msg.includes('already has this profile')) {
          toast.error('Vous avez déjà ce profil');
        } else {
          toast.error(msg);
        }
      }
    } catch (err) {
      console.error('[AddProfile] Exception:', err);
      setSubmitting(false);
      toast.error('Erreur réseau ou serveur : ' + err.message);
    }
  };

  const handleSwitchProfile = async (profileType) => {
    if (profileType === activeProfileType) return;
    setSwitching(profileType);
    const result = await base44.functions.invoke('switchActiveProfile', { profile_type: profileType });
    setSwitching(null);
    if (result.data?.success) {
      toast.success(`🔄 Profil basculé : ${PROFILES.find(p => p.type === profileType)?.label}`);
      // Hard reload pour forcer le rechargement complet de l'UI (APK + navigateur)
      setTimeout(() => { window.location.href = '/'; }, 500);
    } else {
      toast.error(result.data?.error || 'Erreur');
    }
  };

  const availableToAdd = PROFILES.filter(p => !profiles.find(up => up.profile_type === p.type));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const activeCfg = PROFILES.find(p => p.type === activeProfileType);

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex-1">Paramètres du compte</h1>
      </div>

      {/* Carte profil actif */}
      {activeCfg && (
        <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-700 p-5 text-white shadow-lg">
          <p className="text-xs text-white/70 mb-2 font-medium uppercase tracking-wide">Profil actif</p>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
              {activeCfg.emoji}
            </div>
            <div>
              <p className="text-xl font-extrabold">{activeCfg.label}</p>
              <p className="text-xs text-white/70">{user?.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mes profils */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            Mes profils ({profiles.length})
            {availableToAdd.length > 0 && (
              <Button size="sm" onClick={() => setDialogAdd(true)}>
                <Plus className="h-4 w-4 mr-1" /> Ajouter
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Aucun profil configuré</p>
          ) : (
            profiles.map(profile => {
              const cfg = PROFILES.find(p => p.type === profile.profile_type);
              if (!cfg) return null;
              const isActive = activeProfileType === profile.profile_type;
              const statut = STATUT_CFG[profile.status] || STATUT_CFG.en_attente;
              const Icon = cfg.icon;
              return (
                <div
                  key={profile.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    isActive ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{cfg.label}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statut.class}`}>
                        {statut.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{cfg.desc}</p>
                    {profile.status === 'refuse' && profile.refusal_reason && (
                      <p className="text-xs text-red-600 mt-0.5">Motif : {profile.refusal_reason}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {isActive ? (
                      <span className="text-xs font-bold text-primary px-3 py-1 rounded-full bg-primary/10">Actif</span>
                    ) : profile.status === 'actif' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={switching === profile.profile_type}
                        onClick={() => handleSwitchProfile(profile.profile_type)}
                        className="gap-1.5 text-xs"
                      >
                        {switching === profile.profile_type
                          ? <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          : <RefreshCw className="h-3 w-3" />
                        }
                        Utiliser
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">En cours</span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Notice sécurité */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 mt-2">
            <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Le profil <strong>Administrateur</strong> ne peut être attribué que manuellement par un admin CDL. Il n'est pas accessible via cette interface.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Légal & Conformité */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Légal & Conformité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link to="/politique-confidentialite" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Politique de confidentialité</span>
          </Link>
          <Link to="/cgu" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
            <FileText className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Conditions Générales d'Utilisation</span>
          </Link>
          <Link to="/supprimer-compte" className="flex items-center gap-3 p-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors">
            <Trash2 className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-600">Supprimer mon compte</span>
          </Link>
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-3 p-3 rounded-lg border w-full hover:bg-muted transition-colors"
          >
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Se déconnecter</span>
          </button>
        </CardContent>
      </Card>

      {/* Dialog ajouter profil */}
      <Dialog open={dialogAdd} onOpenChange={v => { setDialogAdd(v); if (!v) { setSelectedProfile(null); setFormData({}); } }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajouter un profil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Sélection visuelle */}
            {!selectedProfile ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Choisissez un profil à créer :</p>
                {availableToAdd.map(p => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.type}
                      onClick={() => setSelectedProfile(p.type)}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left"
                    >
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${p.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{p.emoji} {p.label}</p>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                        {!p.immediate && (
                          <span className="text-[10px] text-amber-600 font-medium">⏳ Validation admin requise</span>
                        )}
                        {p.immediate && (
                          <span className="text-[10px] text-green-600 font-medium">✅ Accès immédiat</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => { setSelectedProfile(null); setFormData({}); }}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  ← Changer de profil
                </button>
                {(() => {
                  const cfg = PROFILES.find(p => p.type === selectedProfile);
                  return (
                    <div className={`flex items-center gap-3 p-3 rounded-xl ${cfg.color} bg-opacity-20`}>
                      <span className="text-2xl">{cfg.emoji}</span>
                      <div>
                        <p className="font-semibold">{cfg.label}</p>
                        <p className="text-xs opacity-80">{cfg.desc}</p>
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-3 p-3 rounded-xl bg-muted/50">
                  {Object.entries(PROFILES.find(p => p.type === selectedProfile)?.fields || {}).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs font-semibold">{label} *</Label>
                      <Input
                        placeholder={`Entrez ${label.toLowerCase()}`}
                        value={formData[key] || ''}
                        onChange={e => setFormData({ ...formData, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                  {selectedProfile === 'livreur' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Mode de déplacement *</Label>
                      {[{val:'moto',label:'🛵 Motocyclette'},{val:'vehicule',label:'🚗 Véhicule'}].map(m => (
                        <label key={m.val} className={`flex items-center gap-3 p-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                          moyenDeplacement.includes(m.val) ? 'border-primary bg-primary/5' : 'border-border'
                        }`}>
                          <input
                            type="checkbox"
                            checked={moyenDeplacement.includes(m.val)}
                            onChange={() => setMoyenDeplacement(prev =>
                              prev.includes(m.val) ? prev.filter(x => x !== m.val) : [...prev, m.val]
                            )}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm font-medium">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {!PROFILES.find(p => p.type === selectedProfile)?.immediate && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <span className="text-base">⏳</span>
                    <span>Votre demande sera examinée par l'équipe CDL. Vous serez notifié une fois validé.</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDialogAdd(false)}>
                    Annuler
                  </Button>
                  <Button className="flex-1" onClick={handleAddProfile} disabled={submitting}>
                    {submitting
                      ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Envoi...</>
                      : PROFILES.find(p => p.type === selectedProfile)?.immediate ? '✅ Créer le profil' : '📩 Envoyer la demande'
                    }
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}