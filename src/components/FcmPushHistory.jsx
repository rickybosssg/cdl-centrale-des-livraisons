/**
 * FcmPushHistory — Historique des derniers push envoyés
 * Affiche les dernières Notifications BDD avec type, cible, statut
 * Utilisé dans /fcm-diagnostic
 */
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import moment from 'moment';

const TYPE_LABELS = {
  bedou_recharge_approved: { label: 'Recharge validée', color: 'text-green-700 bg-green-50', icon: '✅' },
  bedou_recharge_rejected: { label: 'Recharge refusée', color: 'text-red-700 bg-red-50', icon: '❌' },
  bedou_recharge_request:  { label: 'Recharge demandée', color: 'text-amber-700 bg-amber-50', icon: '💰' },
  bedou_withdrawal_approved: { label: 'Retrait validé', color: 'text-green-700 bg-green-50', icon: '✅' },
  bedou_withdrawal_rejected: { label: 'Retrait refusé', color: 'text-red-700 bg-red-50', icon: '❌' },
  bedou_withdrawal_request:  { label: 'Retrait demandé', color: 'text-amber-700 bg-amber-50', icon: '💸' },
  bedou_low_balance:       { label: 'Solde faible', color: 'text-orange-700 bg-orange-50', icon: '⚠️' },
  course_created:          { label: 'Course créée', color: 'text-blue-700 bg-blue-50', icon: '🛵' },
  course_assigned:         { label: 'Course assignée', color: 'text-purple-700 bg-purple-50', icon: '📍' },
  course_accepted:         { label: 'Course acceptée', color: 'text-green-700 bg-green-50', icon: '✅' },
  course_in_progress:      { label: 'En route', color: 'text-blue-700 bg-blue-50', icon: '🏃' },
  course_delivered:        { label: 'Livré', color: 'text-green-700 bg-green-50', icon: '🎉' },
  course_cancelled:        { label: 'Annulée', color: 'text-red-700 bg-red-50', icon: '❌' },
  livreur_arrived_pickup:  { label: 'Livreur arrivé', color: 'text-indigo-700 bg-indigo-50', icon: '📍' },
  livreur_near_destination:{ label: 'Proche destination', color: 'text-teal-700 bg-teal-50', icon: '⚡' },
  new_course:              { label: 'Nouvelle course (admin)', color: 'text-slate-700 bg-slate-50', icon: '🛵' },
  new_profile_request:     { label: 'Profil soumis', color: 'text-amber-700 bg-amber-50', icon: '📝' },
  profile_validated:       { label: 'Profil validé', color: 'text-green-700 bg-green-50', icon: '✅' },
  profile_refused:         { label: 'Profil refusé', color: 'text-red-700 bg-red-50', icon: '❌' },
  profile_suspended:       { label: 'Profil suspendu', color: 'text-orange-700 bg-orange-50', icon: '⚠️' },
  new_order:               { label: 'Nouvelle commande', color: 'text-blue-700 bg-blue-50', icon: '🛒' },
  order_ready:             { label: 'Commande prête', color: 'text-teal-700 bg-teal-50', icon: '✅' },
  order_accepted:          { label: 'Commande acceptée', color: 'text-green-700 bg-green-50', icon: '✅' },
  order_delivered:         { label: 'Commande livrée', color: 'text-green-700 bg-green-50', icon: '🎉' },
  order_cancelled:         { label: 'Commande annulée', color: 'text-red-700 bg-red-50', icon: '❌' },
  new_message:             { label: 'Nouveau message', color: 'text-blue-700 bg-blue-50', icon: '💬' },
  admin_message:           { label: 'Message admin', color: 'text-purple-700 bg-purple-50', icon: '📣' },
  new_ad_submitted:        { label: 'Pub soumise', color: 'text-amber-700 bg-amber-50', icon: '📢' },
  ad_validated:            { label: 'Pub validée', color: 'text-green-700 bg-green-50', icon: '✅' },
  ad_refused:              { label: 'Pub refusée', color: 'text-red-700 bg-red-50', icon: '❌' },
  ad_suspended:            { label: 'Pub suspendue', color: 'text-orange-700 bg-orange-50', icon: '⚠️' },
};

export default function FcmPushHistory({ userEmail, isAdmin }) {
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | mine | admin

  const load = async () => {
    setLoading(true);
    try {
      let results;
      if (isAdmin && filter === 'all') {
        results = await base44.entities.Notification.list('-created_date', 50);
      } else if (isAdmin && filter === 'admin') {
        results = await base44.entities.Notification.filter({ destinataire_email: userEmail }, '-created_date', 30);
      } else {
        results = await base44.entities.Notification.filter({ destinataire_email: userEmail }, '-created_date', 30);
      }
      setNotifs(results || []);
    } catch (e) {
      console.error('FcmPushHistory load error:', e?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter, userEmail]);

  const getTypeMeta = (notif) => {
    // Essayer de deviner le type depuis target_entity_type + titre
    const title = notif.titre || '';
    for (const [key, meta] of Object.entries(TYPE_LABELS)) {
      if (title.includes(meta.icon)) return meta;
    }
    return { label: 'Notification', color: 'text-slate-700 bg-slate-50', icon: '🔔' };
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Historique push ({notifs.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <select
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-background"
              >
                <option value="all">Tous</option>
                <option value="mine">Les miennes</option>
              </select>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : notifs.length === 0 ? (
          <p className="text-xs text-center text-muted-foreground py-4">Aucune notification trouvée</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {notifs.map(n => {
              const meta = getTypeMeta(n);
              return (
                <div key={n.id} className="flex items-start gap-2 p-2 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                  <span className="text-base flex-shrink-0 mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.color}`}>
                        {meta.label}
                      </span>
                      {n.lue
                        ? <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                        : <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                      }
                    </div>
                    <p className="text-xs font-semibold mt-0.5 truncate">{n.titre}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{n.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        → {n.destinataire_email}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                        {moment(n.created_date).fromNow()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}