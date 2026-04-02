import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Plus, ExternalLink, CheckCircle2, AlertCircle, Clock, RefreshCw, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const STATUS_CFG = {
  recu:              { label: 'Reçu',            bg: 'bg-blue-100 text-blue-700' },
  incomplet:         { label: 'Incomplet',        bg: 'bg-amber-100 text-amber-700' },
  pret_a_convertir:  { label: 'Prêt à convertir', bg: 'bg-green-100 text-green-700' },
  converti:          { label: 'Converti ✅',      bg: 'bg-gray-100 text-gray-600' },
  erreur:            { label: 'Erreur',           bg: 'bg-red-100 text-red-700' },
};

const EXTRACTORS = [
  { field: 'extracted_depart',      patterns: /d[ée]part\s*[:：]\s*([^\n📍📞📝]+)/i },
  { field: 'extracted_destination', patterns: /(?:destination|arriv[ée]e?)\s*[:：]\s*([^\n📍📞📝]+)/i },
  { field: 'extracted_phone',       patterns: /(?:t[ée]l[ée]phone|t[ée]l|num[ée]ro|📞)\s*[:：]?\s*([0-9+\s]{8,})/i },
  { field: 'extracted_details',     patterns: /(?:d[ée]tails?|colis|📝)\s*[:：]\s*([^\n]+)/i },
];

function parseMessage(raw) {
  const result = {};
  for (const { field, patterns } of EXTRACTORS) {
    const m = raw.match(patterns);
    result[field] = m ? m[1].trim() : '';
  }
  const lower = raw.toLowerCase();
  result.extracted_type =
    lower.includes('récupér') || lower.includes('recuper') ? 'recuperer' :
    lower.includes('déplacement') || lower.includes('deplacement') ? 'deplacement' : 'envoyer';
  result.status = (result.extracted_depart && result.extracted_destination) ? 'pret_a_convertir' : 'incomplet';
  return result;
}

export default function WhatsappOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [converting, setConverting] = useState(null);
  const [form, setForm] = useState({ phone_number: '', client_name: '', raw_message: '', extracted_depart: '', extracted_destination: '', extracted_phone: '', extracted_details: '', extracted_type: 'envoyer' });
  const [filter, setFilter] = useState('tous');
  const [modeAuto, setModeAuto] = useState(() => localStorage.getItem('wa_mode_auto') === 'true');

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.WhatsappInbox.list('-created_date', 100);
    setOrders(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleMessagePaste = (raw) => {
    const extracted = parseMessage(raw);
    setForm(prev => ({ ...prev, raw_message: raw, ...extracted }));
  };

  const handleCreate = async () => {
    if (!form.phone_number || !form.raw_message) return toast.error('Numéro et message requis');
    const inbox = await base44.entities.WhatsappInbox.create({
      phone_number: form.phone_number,
      client_name: form.client_name,
      raw_message: form.raw_message,
      extracted_depart: form.extracted_depart,
      extracted_destination: form.extracted_destination,
      extracted_phone: form.extracted_phone || form.phone_number,
      extracted_details: form.extracted_details,
      extracted_type: form.extracted_type,
      status: (form.extracted_depart && form.extracted_destination) ? 'pret_a_convertir' : 'incomplet',
    });
    toast.success('Demande enregistrée !');
    setShowForm(false);
    setForm({ phone_number: '', client_name: '', raw_message: '', extracted_depart: '', extracted_destination: '', extracted_phone: '', extracted_details: '', extracted_type: 'envoyer' });

    // Mode auto → convertir directement
    if (modeAuto && inbox.status === 'pret_a_convertir') {
      setTimeout(() => handleConvert(inbox.id), 500);
    }
    load();
  };

  const handleConvert = async (id) => {
    setConverting(id);
    const res = await base44.functions.invoke('convertWhatsappToCourse', { inbox_id: id });
    setConverting(null);
    if (res.data?.success) {
      toast.success('✅ Course créée et dispatch lancé !');
      load();
    } else {
      toast.error(res.data?.error || 'Erreur conversion');
    }
  };

  const filtered = filter === 'tous' ? orders : orders.filter(o => o.status === filter);

  const stats = {
    total: orders.length,
    convertis: orders.filter(o => o.status === 'converti').length,
    incomplets: orders.filter(o => o.status === 'incomplet').length,
    prets: orders.filter(o => o.status === 'pret_a_convertir').length,
  };
  const tauxConversion = stats.total > 0 ? Math.round((stats.convertis / stats.total) * 100) : 0;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur p-4 border-b z-10 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">📲 Commandes WhatsApp</h1>
          <p className="text-xs text-muted-foreground">Inbox & conversion automatique</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Saisir</Button>
      </div>

      {/* Mode auto toggle */}
      <div className="px-4 flex items-center justify-between p-3 rounded-xl border-2 bg-card">
        <div>
          <p className="font-semibold text-sm">Mode automatique</p>
          <p className="text-xs text-muted-foreground">Convertit sans validation si champs OK</p>
        </div>
        <button
          onClick={() => { const v = !modeAuto; setModeAuto(v); localStorage.setItem('wa_mode_auto', v); }}
          className={`w-12 h-6 rounded-full transition-colors ${modeAuto ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <div className={`h-5 w-5 bg-white rounded-full shadow transition-transform mx-0.5 ${modeAuto ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="px-4 grid grid-cols-4 gap-2">
        {[
          { val: stats.total, label: 'Total', color: 'text-primary' },
          { val: stats.prets, label: 'Prêts', color: 'text-green-600' },
          { val: stats.incomplets, label: 'Incomplets', color: 'text-amber-600' },
          { val: `${tauxConversion}%`, label: 'Converti', color: 'text-blue-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-2 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="px-4 flex gap-2 overflow-x-auto pb-1">
        {['tous', 'pret_a_convertir', 'incomplet', 'converti', 'recu'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
            {f === 'tous' ? 'Tous' : STATUS_CFG[f]?.label || f}
          </button>
        ))}
      </div>

      {/* Formulaire saisie message */}
      {showForm && (
        <div className="mx-4 p-4 rounded-2xl border-2 border-primary/30 bg-primary/5 space-y-3">
          <p className="font-bold text-sm">📩 Saisir un message WhatsApp reçu</p>
          <div className="space-y-1">
            <Label className="text-xs">Numéro WhatsApp *</Label>
            <Input placeholder="+226 XX XX XX XX" value={form.phone_number} onChange={e => setForm({...form, phone_number: e.target.value})} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nom client (optionnel)</Label>
            <Input placeholder="Nom du client" value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message reçu * (coller ici pour extraction auto)</Label>
            <textarea
              className="w-full h-24 px-3 py-2 text-xs rounded-lg border border-input bg-background resize-none"
              placeholder="Coller le message WhatsApp ici..."
              value={form.raw_message}
              onChange={e => handleMessagePaste(e.target.value)}
            />
          </div>
          {/* Champs extraits */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'extracted_depart', label: 'Départ' },
              { key: 'extracted_destination', label: 'Destination' },
              { key: 'extracted_phone', label: 'Téléphone' },
              { key: 'extracted_details', label: 'Détails colis' },
            ].map(f => (
              <div key={f.key} className="space-y-0.5">
                <Label className="text-[10px]">{f.label}</Label>
                <Input className="h-8 text-xs" value={form[f.key]} onChange={e => setForm({...form, [f.key]: e.target.value})} />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <div className="flex gap-2">
              {[['envoyer','📦 Envoyer'],['recuperer','🔄 Récupérer'],['deplacement','🚗 Déplacement']].map(([v, l]) => (
                <button key={v} onClick={() => setForm({...form, extracted_type: v})}
                  className={`flex-1 text-xs py-1.5 rounded-lg border-2 font-medium transition-colors ${form.extracted_type === v ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button className="flex-1" onClick={handleCreate}>Enregistrer</Button>
          </div>
        </div>
      )}

      {/* Liste */}
      <div className="px-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Aucune demande WhatsApp
          </div>
        ) : filtered.map(order => {
          const s = STATUS_CFG[order.status] || STATUS_CFG.recu;
          return (
            <Card key={order.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm">{order.client_name || order.phone_number}</p>
                    <p className="text-xs text-muted-foreground">{order.phone_number} · {new Date(order.created_date).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg}`}>{s.label}</span>
                </div>

                {/* Infos extraites */}
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {order.extracted_depart && <div><span className="text-muted-foreground">📍 Départ:</span> <span className="font-medium">{order.extracted_depart}</span></div>}
                  {order.extracted_destination && <div><span className="text-muted-foreground">📍 Dest:</span> <span className="font-medium">{order.extracted_destination}</span></div>}
                  {order.extracted_phone && <div><span className="text-muted-foreground">📞</span> <span className="font-medium">{order.extracted_phone}</span></div>}
                  {order.extracted_type && order.extracted_type !== 'inconnu' && <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{order.extracted_type}</span></div>}
                </div>

                {/* Message brut */}
                <div className="text-[10px] bg-muted/50 rounded-lg p-2 text-muted-foreground line-clamp-2">{order.raw_message}</div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {/* Répondre sur WhatsApp */}
                  <a
                    href={`https://wa.me/${order.phone_number.replace(/\D/g, '')}?text=${encodeURIComponent(
                      order.status === 'incomplet'
                        ? `Merci 👋 Pour finaliser votre commande CDL, merci d'indiquer :\n📍 Départ :\n📍 Destination :\n📞 Téléphone :`
                        : `✅ Votre demande CDL a bien été reçue. Nous recherchons un livreur pour vous.`
                    )}`}
                    target="_blank"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-bold"
                  >
                    💬 Répondre WA
                  </a>

                  {/* Convertir en course */}
                  {['pret_a_convertir', 'recu'].includes(order.status) && (
                    <Button size="sm" className="text-xs h-8" disabled={converting === order.id} onClick={() => handleConvert(order.id)}>
                      {converting === order.id ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      Convertir → Course
                    </Button>
                  )}

                  {/* Voir course liée */}
                  {order.linked_course_id && (
                    <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => navigate(`/gerer-courses`)}>
                      <ExternalLink className="h-3 w-3 mr-1" /> Voir course
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}