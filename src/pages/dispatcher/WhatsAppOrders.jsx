import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, MessageCircle, CheckCircle2, AlertCircle, Clock, Zap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import moment from "moment";

const STATUS_CFG = {
  recu:              { label: 'Reçu',           bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-300' },
  incomplet:         { label: 'Incomplet',      bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-300' },
  pret_a_convertir:  { label: 'Prêt',           bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-300' },
  converti_en_course:{ label: 'Converti ✅',    bg: 'bg-primary/5', text: 'text-primary',    border: 'border-primary/30' },
  erreur:            { label: 'Erreur',          bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-300' },
};

export default function WhatsAppOrders() {
  const navigate = useNavigate();
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(null);
  const [filter, setFilter] = useState('all');
  const [autoMode, setAutoMode] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.WhatsAppOrderInbox.list('-created_date', 100);
    setInbox(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.WhatsAppOrderInbox.subscribe((event) => {
      if (event.type === 'create') setInbox(prev => [event.data, ...prev]);
      else if (event.type === 'update') setInbox(prev => prev.map(i => i.id === event.id ? event.data : i));
    });
    return unsub;
  }, []);

  const convertManual = async (entry) => {
    setConverting(entry.id);
    const res = await base44.functions.invoke('convertWhatsAppToOrder', { inbox_id: entry.id });
    setConverting(null);
    if (res.data?.success) {
      toast.success('✅ Course créée et dispatch lancé !');
    } else {
      toast.error(res.data?.message || 'Erreur lors de la conversion');
    }
  };

  const injectManual = async () => {
    const phone = window.prompt('Numéro WhatsApp client :');
    if (!phone) return;
    const msg = window.prompt('Message reçu :');
    if (!msg) return;
    const res = await base44.functions.invoke('processWhatsAppMessage', {
      manual_message: msg,
      phone_number: phone,
      message_id: `manual_${Date.now()}`,
    });
    if (res.data?.success) {
      toast.success('Message traité !');
      load();
    }
  };

  const filtered = filter === 'all' ? inbox : inbox.filter(i => i.status === filter);

  // KPIs
  const total = inbox.length;
  const converted = inbox.filter(i => i.status === 'converti_en_course').length;
  const incomplets = inbox.filter(i => i.status === 'incomplet').length;
  const prets = inbox.filter(i => i.status === 'pret_a_convertir').length;
  const tauxConversion = total > 0 ? Math.round((converted / total) * 100) : 0;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur p-4 border-b z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" /> WhatsApp Orders
          </h1>
          <p className="text-xs text-muted-foreground">{total} demandes reçues</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-4 space-y-4">
        {/* Mode auto toggle */}
        <div className={`flex items-center justify-between p-3 rounded-xl border-2 ${autoMode ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-400'}`}>
          <div>
            <p className="font-bold text-sm">{autoMode ? '⚡ Mode Automatique' : '👤 Mode Assisté'}</p>
            <p className="text-xs text-muted-foreground">
              {autoMode ? 'Les courses complètes sont créées automatiquement' : "Validation admin avant conversion"}
            </p>
          </div>
          <button
            onClick={() => setAutoMode(!autoMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${autoMode ? 'bg-green-600 text-white border-green-600' : 'bg-white text-amber-700 border-amber-400'}`}
          >
            {autoMode ? 'AUTO' : 'ASSISTÉ'}
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-green-600">{converted}</p>
              <p className="text-xs text-muted-foreground">Converties en course</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-primary">{tauxConversion}%</p>
              <p className="text-xs text-muted-foreground">Taux de conversion</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-amber-600">{incomplets}</p>
              <p className="text-xs text-muted-foreground">Incomplets</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-3">
              <p className="text-2xl font-bold text-blue-600">{prets}</p>
              <p className="text-xs text-muted-foreground">Prêts à convertir</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtres */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: `Tous (${total})` },
            { key: 'pret_a_convertir', label: `Prêts (${prets})` },
            { key: 'incomplet', label: `Incomplets (${incomplets})` },
            { key: 'converti_en_course', label: `Convertis (${converted})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                filter === f.key ? 'bg-primary text-white border-primary' : 'bg-white border-border text-muted-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Bouton injection manuelle */}
        <Button variant="outline" className="w-full gap-2" onClick={injectManual}>
          <MessageCircle className="h-4 w-4 text-green-600" />
          Saisir un message WhatsApp manuellement
        </Button>

        {/* Liste */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>Aucune demande WhatsApp</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => {
              const cfg = STATUS_CFG[entry.status] || STATUS_CFG.recu;
              const missing = entry.missing_fields ? JSON.parse(entry.missing_fields) : [];
              return (
                <Card key={entry.id} className={`border-2 ${cfg.border}`}>
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">📱</span>
                          <span className="font-bold text-sm">{entry.phone_number}</span>
                          {entry.client_name && <span className="text-xs text-muted-foreground">({entry.client_name})</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{moment(entry.created_date).format('DD/MM HH:mm')}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Message brut */}
                    <div className="bg-muted/40 rounded-lg p-2 text-xs text-muted-foreground italic line-clamp-3">
                      "{entry.raw_message}"
                    </div>

                    {/* Infos extraites */}
                    {(entry.extracted_depart || entry.extracted_destination) && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {entry.extracted_depart && (
                          <div className="bg-green-50 rounded-lg p-2">
                            <p className="text-[10px] font-bold text-green-700 uppercase">Départ</p>
                            <p className="font-medium text-green-800">{entry.extracted_depart}</p>
                          </div>
                        )}
                        {entry.extracted_destination && (
                          <div className="bg-blue-50 rounded-lg p-2">
                            <p className="text-[10px] font-bold text-blue-700 uppercase">Destination</p>
                            <p className="font-medium text-blue-800">{entry.extracted_destination}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Champs manquants */}
                    {missing.length > 0 && (
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        <span>Manquant : {missing.join(', ')}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {/* Répondre WhatsApp */}
                      <a
                        href={`https://wa.me/${entry.phone_number?.replace(/\D/g, '')}?text=${encodeURIComponent(
                          missing.length > 0
                            ? `Merci pour votre demande. Pour finaliser, merci d'envoyer : ${missing.map((f,i) => `\n${i+1}. ${f}`).join('')}`
                            : `✅ Votre demande a été reçue. Un livreur CDL va être assigné.`
                        )}`}
                        target="_blank"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold"
                      >
                        <MessageCircle className="h-3 w-3" /> Répondre
                      </a>

                      {/* Convertir manuellement */}
                      {['pret_a_convertir', 'incomplet', 'recu'].includes(entry.status) && !entry.linked_course_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={converting === entry.id}
                          onClick={() => convertManual(entry)}
                        >
                          <Zap className="h-3 w-3 text-primary" />
                          {converting === entry.id ? 'En cours...' : 'Convertir en course'}
                        </Button>
                      )}

                      {/* Voir course liée */}
                      {entry.linked_course_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => navigate(`/gerer-courses`)}
                        >
                          <ExternalLink className="h-3 w-3" /> Voir course
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}