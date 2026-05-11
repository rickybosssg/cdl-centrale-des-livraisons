import { useState, useEffect } from "react";
import GpsLocationManager from "@/components/GpsLocationManager";
import EditPersonalInfoModal from "@/components/EditPersonalInfoModal";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, CheckCircle2, XCircle, Shield, FileText,
  LogOut, User, Truck, Store, Megaphone, RefreshCw, Lock, Keyboard,
} from "lucide-react";
import { isKeyboardFxEnabled, setKeyboardFxEnabled } from "@/lib/keyboardFeedback";
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
    fields: { telephone: 'Téléphone', quartier: 'Quartier' },
  },
  {
    type: 'annonceur', label: 'Annonceur', emoji: '📢',
    icon: Megaphone, color: 'bg-pink-100 text-pink-700',
    desc: 'Publiez vos annonces sur CDL — soumis à validation',
    immediate: false,
    fields: { telephone: 'Téléphone', quartier: 'Quartier' },
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
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [formData, setFormData] = useState({});
  const [moyenDeplacement, setMoyenDeplacement] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [switching, setSwitching] = useState(null);
  const [deplError, setDeplError] = useState(false);
  const [codePromo, setCodePromo] = useState("");
  const [keyFxEnabled, setKeyFxState] = useState(() => isKeyboardFxEnabled());
  const [codePromoError, setCodePromoError] = useState("");

  const load = async () => {
    console.log('[Settings] Chargement utilisateur et profils...');
    const me = await base44.auth.me();
    console.log('[Settings] User loaded:', {
      email: me.email,
      role: me.role,
      user_type: me.user_type,
      active_profile_type: me.active_profile_type,
    });
    setUser(me);
    const userProfiles = await base44.entities.UserProfile.filter({
      user_email: me.email,
      deleted: false,
    });
    console.log('[Settings] Profils chargés:', userProfiles.length);
    userProfiles.forEach(p => {
      console.log(`  - ${p.profile_type} (${p.status}) - actif: ${p.is_active_profile}`);
    });
    setProfiles(userProfiles);
    setLoading(false);
  };

  useEffect(() => { 
    console.log('[Settings] Component monté');
    load();
  }, []);

  // LOGIQUE STRICTE: admin role est prioritaire
  const isAdmin = user?.role === 'admin' || user?.user_type === 'admin';
  const activeProfileType = isAdmin ? 'admin' : (user?.active_profile_type || user?.user_type);
  console.log('[Settings] Display logic:', { isAdmin, activeProfileType, 'user.role': user?.role });

  const handleAddProfile = async () => {
    console.log('[Settings.handleAddProfile] Début création profil:', selectedProfile);
    if (!selectedProfile) return toast.error('Choisissez un profil');
    const cfg = PROFILES.find(p => p.type === selectedProfile);
    const missing = Object.keys(cfg.fields).filter(k => !formData[k]);
    if (missing.length > 0) {
      const fieldLabels = missing.map(k => cfg.fields[k] || k).join(', ');
      toast.error(`Champs obligatoires manquants : ${fieldLabels}`);
      return;
    }

    // Validation livreur : moyen_deplacement
    if (selectedProfile === 'livreur' && moyenDeplacement.length === 0) {
      setDeplError(true);
      toast.error('Veuillez sélectionner au moins un mode de déplacement');
      return;
    }
    setDeplError(false);

    // Validation commercial : code promo
    if (selectedProfile === 'commercial' && !codePromo.trim()) {
      setCodePromoError('Code promo obligatoire');
      toast.error('Code promo obligatoire');
      return;
    }
    setCodePromoError('');

    const payload = { ...formData, email: user.email, full_name: user.full_name };
    if (selectedProfile === 'livreur') {
      payload.moyen_deplacement = JSON.stringify(moyenDeplacement);
    }
    if (selectedProfile === 'commercial') {
      payload.code_promo = codePromo.trim().toUpperCase();
    }

    console.log('[AddProfile] ====== PAYLOAD ENVOYÉ ======');
    console.log('[AddProfile] profile_type:', selectedProfile);
    console.log('[AddProfile] telephone:', payload.telephone);
    console.log('[AddProfile] quartier:', payload.quartier);
    console.log('[AddProfile] moyen_deplacement:', payload.moyen_deplacement);
    console.log('[AddProfile] payload complet:', JSON.stringify(payload));
    setSubmitting(true);
    try {
      console.log('[Settings.handleAddProfile] Appel addProfileToUser...');
      const result = await base44.functions.invoke('addProfileToUser', {
        profile_type: selectedProfile,
        data: payload,
      });
      console.log('[Settings.handleAddProfile] Réponse API:', result.data);
      setSubmitting(false);
      if (result.data?.success) {
        console.log('[Settings.handleAddProfile] SUCCÈS');
        const profileLabel = PROFILES.find(p => p.type === selectedProfile)?.label || selectedProfile;
        const pairedType = result.data?.auto_paired?.type;
        const pairedLabel = { client: 'Client', commercial: 'Commercial' }[pairedType];
        
        if (pairedLabel) {
          toast.success(
            `🎉 ${profileLabel} créé ! Votre profil ${pairedLabel} a aussi été activé automatiquement.`,
            { duration: 5000 }
          );
        } else if (result.data.status === 'actif') {
          toast.success(`✅ ${profileLabel} activé immédiatement !`, { duration: 4000 });
        } else {
          toast.success(`⏳ Demande ${profileLabel} envoyée à l'équipe CDL`, { duration: 4000 });
        }
        
        setDialogAdd(false);
        setSelectedProfile(null);
        setFormData({});
        setMoyenDeplacement([]);
        setCodePromo("");
        setCodePromoError("");
        console.log('[Settings.handleAddProfile] Rechargement des données...');
        await load();
      } else {
        const msg = result.data?.error || 'Erreur lors de la création';
        console.log('[Settings.handleAddProfile] ERROR:', msg);
        if (msg.includes('already has this profile')) {
          toast.error('Vous avez déjà ce profil');
        } else {
          toast.error(msg);
        }
      }
    } catch (err) {
      console.error('[Settings.handleAddProfile] Exception:', err);
      setSubmitting(false);
      toast.error('Erreur réseau ou serveur : ' + err.message);
    }
  };

  const handleSwitchProfile = async (profileType) => {
    console.log('[Settings.handleSwitchProfile] Basculement vers:', profileType);
    if (profileType === activeProfileType) {
      console.log('[Settings.handleSwitchProfile] Déjà actif');
      return;
    }
    setSwitching(profileType);
    try {
      const result = await base44.functions.invoke('switchActiveProfile', { profile_type: profileType });
      console.log('[Settings.handleSwitchProfile] Réponse:', result.data);
      setSwitching(null);
      if (result.data?.success) {
        console.log('[Settings.handleSwitchProfile] SUCCÈS, rechargement...');
        toast.success(`🔄 Profil basculé : ${PROFILES.find(p => p.type === profileType)?.label}`);
        // Hard reload pour forcer le rechargement complet de l'UI (APK + navigateur)
        setTimeout(() => { window.location.href = '/'; }, 500);
      } else {
        console.log('[Settings.handleSwitchProfile] ERROR:', result.data?.error);
        toast.error(result.data?.error || 'Erreur');
      }
    } catch (err) {
      console.error('[Settings.handleSwitchProfile] Exception:', err);
      setSwitching(null);
      toast.error('Erreur lors du changement de profil');
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

      {/* Carte profil actif - ADMIN PRIORITAIRE */}
      {(() => {
        // Recalculer activeCfg pour cette section aussi
        const displayProfile = isAdmin ? 'admin' : activeProfileType;
        const displayCfg = PROFILES.find(p => p.type === displayProfile) || { emoji: '👤', label: 'Profil', color: 'bg-blue-100 text-blue-700', desc: '' };
        return displayCfg;
      })() && (
        <div className={`rounded-2xl p-5 text-white shadow-lg ${
          isAdmin 
            ? 'bg-gradient-to-br from-blue-900 to-blue-700'
            : 'bg-gradient-to-br from-primary to-blue-700'
        }`}>
            <p className="text-xs text-white/70 mb-2 font-medium uppercase tracking-wide">Profil actif</p>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
              {isAdmin ? '🛡️' : (() => {
                const cfg = PROFILES.find(p => p.type === activeProfileType);
                return cfg?.emoji || '👤';
              })()}
            </div>
            <div>
              <p className="text-xl font-extrabold">{isAdmin ? 'Administrateur' : (() => {
                const cfg = PROFILES.find(p => p.type === activeProfileType);
                return cfg?.label || activeProfileType || 'Profil';
              })()}</p>
              <p className="text-xs text-white/70">{user?.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mes profils - MASQUÉ POUR ADMINS */}
      {!isAdmin && (
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
                    ) : profile.status === 'incomplet' ? (
                      <Button
                        size="sm"
                        className="bg-amber-500 hover:bg-amber-600 text-xs gap-1.5"
                        onClick={() => navigate(`/complete-profile/${profile.id}`)}
                      >
                        Compléter
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
        )}

        {/* ─── Informations personnelles ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              Informations personnelles
              <Button size="sm" variant="outline" onClick={() => setShowEditInfo(true)} className="gap-1.5 text-xs">
                ✏️ Modifier
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">Nom complet</p>
                <p className="text-sm font-semibold">{user?.full_name || '—'}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/50">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">Téléphone</p>
                <p className="text-sm font-semibold">{user?.telephone || '—'}</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">📧 Email : {user?.email}</p>
          </CardContent>
        </Card>

        <EditPersonalInfoModal
          open={showEditInfo}
          onClose={() => setShowEditInfo(false)}
          user={user}
          onSaved={(updated) => setUser(prev => ({ ...prev, ...updated }))}
        />

        {/* Info admin - afficher si admin */}
          {isAdmin && (
          <Card className="border-blue-300 bg-blue-50">
           <CardContent className="p-4 space-y-2">
             <p className="text-sm font-semibold text-blue-900">🛡️ Profil administrateur</p>
             <p className="text-xs text-blue-700">Vous êtes administrateur du système CDL. Vous avez accès complet au tableau de bord d'administration.</p>
           </CardContent>
          </Card>
           )}

        {/* Localisation GPS */}
      {!isAdmin && activeProfileType === 'client' && (
        <GpsLocationManager onLocationUpdate={async (data) => {
          try {
            await base44.auth.updateMe(data);
            setUser(prev => ({ ...prev, ...data }));
          } catch (err) {
            console.error('[Settings] Erreur GPS:', err);
          }
        }} />
      )}

      {/* Diagnostic notifications */}
      <div className="space-y-2">
        <Link to="/fcm-token-refresh" className="flex items-center gap-3 p-4 rounded-xl border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors">
          <span className="text-xl">🔑</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-purple-900">Gérer Token FCM</p>
            <p className="text-xs text-purple-700">Rafraîchir et nettoyer les tokens</p>
          </div>
          <span className="text-purple-400 text-sm">›</span>
        </Link>
        <Link to="/fcm-quick-test" className="flex items-center gap-3 p-4 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 transition-colors">
          <span className="text-xl">✅</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-900">Test FCM Rapide</p>
            <p className="text-xs text-green-700">Vérifier token et envoyer notification test</p>
          </div>
          <span className="text-green-400 text-sm">›</span>
        </Link>
        <Link to="/fcm-diagnostic" className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors">
          <span className="text-xl">🔔</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-900">Diagnostic détaillé</p>
            <p className="text-xs text-blue-700">Debug FCM complet avec tous les logs</p>
          </div>
          <span className="text-blue-400 text-sm">›</span>
        </Link>
      </div>

      {/* Effets clavier */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Keyboard className="h-4 w-4" /> Expérience saisie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="text-sm font-semibold">Effets clavier</p>
              <p className="text-xs text-muted-foreground">Vibration, son discret et animation lors de la saisie</p>
            </div>
            <button
              onClick={() => {
                const next = !keyFxEnabled;
                setKeyFxState(next);
                setKeyboardFxEnabled(next);
              }}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${keyFxEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${keyFxEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
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
            onClick={() => {
              try { localStorage.removeItem('base44_access_token'); } catch(_) {}
              window.location.href = '/connexion';
            }}
            className="flex items-center gap-3 p-3 rounded-lg border w-full hover:bg-muted transition-colors"
          >
            <LogOut className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Se déconnecter</span>
          </button>
        </CardContent>
      </Card>

      {/* Dialog ajouter profil */}
      <Dialog open={dialogAdd} onOpenChange={v => {
        setDialogAdd(v);
        if (!v) {
          console.log('[Settings] Fermeture dialog');
          setSelectedProfile(null);
          setFormData({});
          setMoyenDeplacement([]);
          setCodePromo("");
          setCodePromoError("");
          setSubmitting(false);
          setDeplError(false);
        }
      }}>
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
                  type="button"
                  onClick={() => { 
                    console.log('[Settings] Retour à la sélection de profil');
                    setSelectedProfile(null);
                    setFormData({});
                    setMoyenDeplacement([]);
                    setCodePromo("");
                    setCodePromoError("");
                    setDeplError(false);
                  }}
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
                  {Object.entries(PROFILES.find(p => p.type === selectedProfile)?.fields || {}).filter(([key]) => key !== 'code_promo').map(([key, label]) => (
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
                      <Label className="text-xs font-semibold">Mode de déplacement * <span className="text-amber-600">(obligatoire)</span></Label>
                      <div className="flex gap-2">
                        {[{val:'moto',label:'🛵 Moto'},{val:'vehicule',label:'🚗 Véhicule'}].map(m => {
                          const sel = moyenDeplacement.includes(m.val);
                          return (
                            <button
                              key={m.val}
                              type="button"
                              onClick={() => {
                                setDeplError(false);
                                setMoyenDeplacement(prev =>
                                  prev.includes(m.val) ? prev.filter(x => x !== m.val) : [...prev, m.val]
                                );
                              }}
                              className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                                sel ? 'border-primary bg-primary text-white' : 'border-border bg-white text-foreground'
                              }`}
                            >
                              {m.label}{sel && <span className="ml-1">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                      {moyenDeplacement.length > 0 && (
                        <p className="text-xs text-green-700 font-medium">✅ Sélectionné : {moyenDeplacement.join(', ')}</p>
                      )}
                      {deplError && moyenDeplacement.length === 0 && (
                        <p className="text-xs text-red-600 font-semibold">⚠️ Veuillez choisir un moyen de déplacement</p>
                      )}
                    </div>
                  )}
                  {selectedProfile === 'commercial' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Code promo * <span className="text-amber-600">(obligatoire)</span></Label>
                      <p className="text-[10px] text-muted-foreground">Votre code promo est votre source de revenu. Partagez-le pour gagner de l'argent 💰</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ex: ERIC01, CDL245..."
                          value={codePromo}
                          onChange={e => {
                            setCodePromoError('');
                            setCodePromo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                          }}
                          maxLength={12}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs whitespace-nowrap"
                          onClick={() => {
                            const base = (user?.full_name || 'CDL').replace(/\s+/g, '').toUpperCase().slice(0, 4);
                            const rand = Math.floor(10 + Math.random() * 90);
                            setCodePromo(base + rand);
                            setCodePromoError('');
                          }}
                        >
                          🎲 Générer
                        </Button>
                      </div>
                      {codePromo && (
                        <p className="text-xs font-bold text-primary">Code : <span className="bg-primary/10 px-2 py-0.5 rounded">{codePromo}</span></p>
                      )}
                      {codePromoError && <p className="text-xs text-red-600">{codePromoError}</p>}
                      <p className="text-[10px] text-muted-foreground">4-12 caractères, lettres et chiffres uniquement. Non modifiable après création.</p>
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
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogAdd(false)}>
                    Annuler
                  </Button>
                  <Button type="button" className="flex-1" onClick={handleAddProfile} disabled={submitting}>
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