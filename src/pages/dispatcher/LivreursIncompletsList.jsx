import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Send, Users, RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import moment from "moment";

const QUICK_MESSAGES = [
  "👋 Bonjour, votre inscription CDL est presque terminée. Envoyez vos documents pour commencer à recevoir des courses !",
  "⚠️ Documents manquants : CNIB recto + verso requis.",
  "⚠️ Merci d'ajouter une photo de votre moto ou véhicule.",
  "📋 Votre dossier est incomplet. Complétez-le pour être validé.",
  "🔥 Des courses sont disponibles ! Finalisez votre dossier maintenant.",
  "🚀 CDL recrute ! Ne perdez pas votre place. Complétez votre dossier.",
];

const DOC_LABELS = {
  photo_profil: "Photo de profil",
  photo_identite_recto: "CNI Recto",
  photo_identite_verso: "CNI Verso",
  photo_moyen_deplacement: "Photo véhicule",
};

export default function LivreursIncompletsList() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [relancing, setRelancing] = useState(false);
  const [autoRelancing, setAutoRelancing] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [filterType, setFilterType] = useState("all"); // all | nodoc | partial

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.UserProfile.filter({ profile_type: 'livreur', deleted: false });
    const incomplete = all.filter(p => {
      if (['actif', 'bloque', 'suspendu'].includes(p.status)) return false;
      const docs = p.documents_json ? JSON.parse(p.documents_json) : {};
      const required = ['photo_profil', 'photo_identite_recto', 'photo_identite_verso', 'photo_moyen_deplacement'];
      return required.some(k => !docs[k]);
    });

    // Enrichir avec noms users
    const enriched = await Promise.all(incomplete.map(async (p) => {
      const users = await base44.entities.User.filter({ email: p.user_email });
      const u = users[0] || {};
      const docs = p.documents_json ? JSON.parse(p.documents_json) : {};
      const missing = Object.keys(DOC_LABELS).filter(k => !docs[k]);
      return { ...p, user_name: u.full_name || '', user_phone: u.telephone || '', missing_docs: missing };
    }));

    setProfiles(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = profiles.filter(p => {
    if (filterType === "nodoc") return p.missing_docs.length === 4;
    if (filterType === "partial") return p.missing_docs.length > 0 && p.missing_docs.length < 4;
    return true;
  });

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const sendRelance = async (emails, message) => {
    let sent = 0;
    for (const email of emails) {
      await base44.functions.invoke('relanceLivreursIncomplets', {
        manual_email: email,
        manual_message: message || undefined,
      });
      sent++;
    }
    return sent;
  };

  const handleRelanceSelected = async () => {
    if (selected.size === 0) return toast.error("Sélectionnez au moins un livreur");
    setRelancing(true);
    const emails = filtered.filter(p => selected.has(p.id)).map(p => p.user_email);
    const msg = customMessage.trim() || undefined;
    const sent = await sendRelance(emails, msg);
    toast.success(`✅ ${sent} relance(s) envoyée(s)`);
    setSelected(new Set());
    setCustomMessage("");
    setRelancing(false);
    await load();
  };

  const handleRelanceOne = async (profile) => {
    setRelancing(true);
    await sendRelance([profile.user_email], customMessage.trim() || undefined);
    toast.success(`✅ Relance envoyée à ${profile.user_email}`);
    setRelancing(false);
    await load();
  };

  const handleAutoRelance = async () => {
    setAutoRelancing(true);
    const res = await base44.functions.invoke('relanceLivreursIncomplets', {});
    toast.success(`✅ Relance auto : ${res.data?.sent || 0} message(s) envoyé(s)`);
    setAutoRelancing(false);
    await load();
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Livreurs incomplets
          </h1>
          <p className="text-xs text-muted-foreground">{filtered.length} dossier(s) incomplet(s)</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleAutoRelance} disabled={autoRelancing} className="gap-1.5 text-xs">
          {autoRelancing ? <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Relance auto
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        {[["all","Tous"], ["nodoc","0 document"], ["partial","Partiel"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilterType(val)}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
              filterType === val ? "bg-primary text-white border-primary" : "border-border hover:border-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Message personnalisé */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Message de relance (optionnel)</p>
        <div className="flex gap-2">
          <Input
            placeholder="Message personnalisé..."
            value={customMessage}
            onChange={e => setCustomMessage(e.target.value)}
            className="flex-1 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_MESSAGES.map((m, i) => (
            <button
              key={i}
              onClick={() => setCustomMessage(m)}
              className="text-[10px] px-2 py-1 rounded-lg bg-muted hover:bg-primary/10 hover:text-primary border border-border transition-colors text-left"
            >
              {m.slice(0, 40)}…
            </button>
          ))}
        </div>
      </div>

      {/* Actions groupées */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-2">
          <button onClick={toggleAll} className="text-xs text-primary underline">
            {selected.size === filtered.length ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
          <span className="text-xs text-muted-foreground">{selected.size} sélectionné(s)</span>
          {selected.size > 0 && (
            <Button size="sm" className="gap-1.5 text-xs ml-auto" onClick={handleRelanceSelected} disabled={relancing}>
              <Send className="h-3 w-3" />
              {relancing ? "Envoi..." : `Relancer (${selected.size})`}
            </Button>
          )}
        </div>
      )}

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <CheckCircle2 className="h-10 w-10 mx-auto text-green-400" />
          <p className="font-semibold">Aucun livreur incomplet</p>
          <p className="text-sm text-muted-foreground">Tous les dossiers sont complets !</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(profile => (
            <Card
              key={profile.id}
              className={`border-l-4 transition-all cursor-pointer ${
                selected.has(profile.id) ? "border-l-primary bg-primary/5" : "border-l-amber-400"
              }`}
              onClick={() => toggleSelect(profile.id)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700 flex-shrink-0 text-sm">
                    {profile.user_name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{profile.user_name || profile.user_email}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        profile.status === 'incomplet' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {profile.status}
                      </span>
                      {profile.relance_count > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {profile.relance_count} relance(s)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{profile.user_email}</p>
                    {profile.user_phone && <p className="text-xs text-muted-foreground">{profile.user_phone}</p>}
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Inscrit {moment(profile.created_date).fromNow()}
                      {profile.derniere_relance && ` · Dernière relance ${moment(profile.derniere_relance).fromNow()}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={e => { e.stopPropagation(); handleRelanceOne(profile); }}
                      disabled={relancing}
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Documents manquants */}
                {profile.missing_docs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {profile.missing_docs.map(doc => (
                      <span key={doc} className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        ❌ {DOC_LABELS[doc]}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}