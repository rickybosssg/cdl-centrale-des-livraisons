/**
 * NotifCoverage — Vérification couverture push globale CDL
 * =========================================================
 * Vérifie que chaque profil (admin, client, livreur, partenaire,
 * commercial, annonceur) a bien un token FCM actif ET peut recevoir
 * un push via sendCdlNotification (moteur unique).
 *
 * NE TOUCHE PAS à Bedou, dispatch, auth ou logique métier.
 */

import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Send, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const PROFILES = [
  { key: 'admin',      label: 'Admin',      emoji: '🛡️', route: '/admin-pro',              event: 'new_course' },
  { key: 'client',     label: 'Client',     emoji: '👤', route: '/mes-courses',             event: 'course_created' },
  { key: 'livreur',   label: 'Livreur',    emoji: '🛵', route: '/courses-disponibles',      event: 'course_assigned' },
  { key: 'partenaire', label: 'Partenaire', emoji: '🏪', route: '/commandes-partenaire',     event: 'new_order' },
  { key: 'commercial', label: 'Commercial', emoji: '📣', route: '/mon-bedou',               event: 'commission_credited' },
  { key: 'annonceur',  label: 'Annonceur',  emoji: '📢', route: '/mes-publicites-annonceur', event: 'ad_validated' },
];

// sendCdlNotification — fonction unique pour tous les profils
const NOTIF_ENGINE = 'sendCdlNotification';

export default function NotifCoverage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [coverage, setCoverage] = useState({});   // { [email]: { tokens, profile_type } }
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState({});      // { [key]: bool }
  const [results, setResults] = useState({});      // { [key]: { sent, failed, note } }
  const [summary, setSummary] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const me = await base44.auth.me();
      setUser(me);
      if (me.role !== 'admin') {
        toast.error('Accès admin requis');
        navigate('/');
        return;
      }

      // Charger tous les profils actifs — 1 requête par profil
      const profileTypes = ['client', 'livreur', 'partenaire', 'commercial', 'annonceur'];
      const profileResults = await Promise.allSettled(
        profileTypes.map(pt =>
          base44.entities.UserProfile.filter({ profile_type: pt, status: 'actif', deleted: false }, null, 20)
        )
      );

      // Charger tous les tokens actifs
      const allTokens = await base44.entities.FcmToken.filter({ is_active: true }, null, 200);
      const tokenByEmail = {};
      for (const t of allTokens) {
        const e = (t.user_email || '').toLowerCase();
        if (!tokenByEmail[e]) tokenByEmail[e] = [];
        tokenByEmail[e].push(t);
      }

      // Charger les admins
      const admins = await base44.entities.User.filter({ role: 'admin' }, null, 10);

      // Construire la couverture
      const cov = {};

      // Admins
      for (const a of admins) {
        const e = (a.email || '').toLowerCase();
        cov[e] = { profile_type: 'admin', email: e, name: a.full_name || e, tokens: tokenByEmail[e] || [] };
      }

      // Profils actifs
      for (let i = 0; i < profileTypes.length; i++) {
        const r = profileResults[i];
        if (r.status !== 'fulfilled') continue;
        for (const p of r.value) {
          const e = (p.user_email || '').toLowerCase();
          if (!cov[e]) {
            cov[e] = { profile_type: p.profile_type, email: e, name: e, tokens: tokenByEmail[e] || [] };
          }
        }
      }

      setCoverage(cov);

      // Résumé
      const total = Object.keys(cov).length;
      const withToken = Object.values(cov).filter(c => c.tokens.length > 0).length;
      const byProfile = {};
      for (const c of Object.values(cov)) {
        const pt = c.profile_type;
        if (!byProfile[pt]) byProfile[pt] = { total: 0, withToken: 0 };
        byProfile[pt].total++;
        if (c.tokens.length > 0) byProfile[pt].withToken++;
      }
      setSummary({ total, withToken, withoutToken: total - withToken, byProfile });
    } catch (e) {
      toast.error('Erreur chargement: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Envoyer un push test à UN profil donné
  const sendTestToProfile = async (profileKey) => {
    const profile = PROFILES.find(p => p.key === profileKey);
    if (!profile) return;

    setSending(prev => ({ ...prev, [profileKey]: true }));
    setResults(prev => ({ ...prev, [profileKey]: null }));

    try {
      // Trouver un utilisateur de ce profil avec un token
      const targetEntry = Object.values(coverage).find(
        c => c.profile_type === profileKey && c.tokens.length > 0
      );

      if (!targetEntry) {
        setResults(prev => ({ ...prev, [profileKey]: { ok: false, note: 'Aucun utilisateur avec token actif' } }));
        setSending(prev => ({ ...prev, [profileKey]: false }));
        return;
      }

      const payload = profileKey === 'admin'
        ? {
            role: 'admin',
            title: `🧪 Test push ${profile.label}`,
            body: `Test moteur ${NOTIF_ENGINE} — ${profile.label} — ${new Date().toLocaleTimeString('fr-FR')}`,
            data: { type: profile.event, entity_id: `test_coverage_${profileKey}`, entity_type: 'test', notif_route: profile.route },
          }
        : {
            user_email: targetEntry.email,
            title: `🧪 Test push ${profile.label}`,
            body: `Test moteur ${NOTIF_ENGINE} — ${profile.label} — ${new Date().toLocaleTimeString('fr-FR')}`,
            data: { type: profile.event, entity_id: `test_coverage_${profileKey}`, entity_type: 'test', notif_route: profile.route },
          };

      const res = await base44.functions.invoke('sendCdlNotification', payload);
      const d = res.data;
      const ok = (d?.sent || 0) > 0;

      setResults(prev => ({
        ...prev,
        [profileKey]: {
          ok,
          sent: d?.sent || 0,
          failed: d?.failed || 0,
          bdd: d?.bdd || 0,
          total: d?.total || 0,
          note: d?.note || null,
          target: targetEntry.email,
          engine: NOTIF_ENGINE,
        },
      }));

      if (ok) {
        toast.success(`✅ Push ${profile.label} envoyé → ${targetEntry.email}`);
      } else {
        toast.error(`❌ Push ${profile.label} échoué — ${d?.note || 'token absent ?'}`);
      }
    } catch (e) {
      setResults(prev => ({ ...prev, [profileKey]: { ok: false, note: e.message } }));
      toast.error('Erreur: ' + e.message);
    } finally {
      setSending(prev => ({ ...prev, [profileKey]: false }));
    }
  };

  // Envoyer un push test à TOUS les profils en parallèle
  const sendTestAll = async () => {
    await Promise.allSettled(PROFILES.map(p => sendTestToProfile(p.key)));
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const byProfile = summary?.byProfile || {};

  return (
    <div className="space-y-4 pb-20 max-w-2xl mx-auto px-2">

      <div className="bg-primary text-white text-center py-2 px-3 rounded-xl font-bold text-sm">
        🔔 COUVERTURE PUSH GLOBALE — moteur unique : {NOTIF_ENGINE}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Couverture Push — Tous Profils</h1>
          <p className="text-xs text-muted-foreground">Canal : cdl_critical_alerts_v2 — Moteur : {NOTIF_ENGINE}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Résumé global */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-primary/10 text-center">
            <p className="text-2xl font-extrabold text-primary">{summary.total}</p>
            <p className="text-xs text-muted-foreground">Utilisateurs</p>
          </div>
          <div className="p-3 rounded-xl bg-green-50 text-center">
            <p className="text-2xl font-extrabold text-green-700">{summary.withToken}</p>
            <p className="text-xs text-muted-foreground">Avec token</p>
          </div>
          <div className="p-3 rounded-xl bg-red-50 text-center">
            <p className="text-2xl font-extrabold text-red-600">{summary.withoutToken}</p>
            <p className="text-xs text-muted-foreground">Sans token</p>
          </div>
        </div>
      )}

      {/* Couverture par profil */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Couverture token par profil</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {PROFILES.map(p => {
            const stat = byProfile[p.key] || { total: 0, withToken: 0 };
            const pct = stat.total > 0 ? Math.round((stat.withToken / stat.total) * 100) : 0;
            const ok = pct >= 80;
            return (
              <div key={p.key} className="flex items-center gap-3 py-2 border-b last:border-0">
                <span className="text-lg flex-shrink-0">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold">{p.label}</span>
                    <span className={`text-xs font-bold ${ok ? 'text-green-700' : stat.total === 0 ? 'text-muted-foreground' : 'text-amber-700'}`}>
                      {stat.withToken}/{stat.total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ok ? 'bg-green-500' : 'bg-amber-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Tests push par profil */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            Tests push par profil (moteur unique)
            <Button size="sm" onClick={sendTestAll} className="text-xs h-7">
              <Send className="h-3 w-3 mr-1" /> Tester tout
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {PROFILES.map(p => {
            const r = results[p.key];
            const isSending = sending[p.key];
            const stat = byProfile[p.key] || { total: 0, withToken: 0 };
            const hasTarget = stat.withToken > 0;

            return (
              <div key={p.key} className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-lg flex-shrink-0">{p.emoji}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{p.label}</p>
                    <p className="text-[10px] text-muted-foreground">event: {p.event}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendTestToProfile(p.key)}
                    disabled={isSending || !hasTarget}
                    className="h-8 text-xs flex-shrink-0"
                  >
                    {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                    Test
                  </Button>
                </div>

                {r && (
                  <div className={`ml-8 p-2 rounded-lg text-[11px] font-mono ${r.ok ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      {r.ok
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                      <span className={`font-bold ${r.ok ? 'text-green-800' : 'text-red-700'}`}>
                        {r.ok ? 'PUSH OK' : 'PUSH ÉCHOUÉ'}
                      </span>
                    </div>
                    {r.target && <p className="text-muted-foreground">→ {r.target}</p>}
                    <p>sent={r.sent ?? '?'} failed={r.failed ?? '?'} bdd={r.bdd ?? '?'}</p>
                    {r.note && <p className="text-amber-700">note: {r.note}</p>}
                    <p className="text-muted-foreground">engine: {NOTIF_ENGINE} | canal: cdl_critical_alerts_v2</p>
                  </div>
                )}

                {!hasTarget && !r && (
                  <div className="ml-8 flex items-center gap-1 text-[11px] text-amber-700">
                    <AlertCircle className="h-3 w-3" />
                    Aucun {p.label.toLowerCase()} avec token FCM actif
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Architecture moteur */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-primary">Architecture moteur push CDL</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 text-xs space-y-1.5 text-primary/80">
          <p>✅ <strong>Moteur unique :</strong> {NOTIF_ENGINE}</p>
          <p>✅ <strong>Canal Android :</strong> cdl_critical_alerts_v2 (importance=5)</p>
          <p>✅ <strong>Source token :</strong> FcmBootstrap (seule source d'enregistrement)</p>
          <p>✅ <strong>Notification interne :</strong> Notification.create (dans sendCdlNotification)</p>
          <p>✅ <strong>Handlers entity :</strong> notifyBedouEvents → notifyCourseEvents → notifyProfileEvents → notifyCommandeEvents → notifyPubliciteEvents → notifyRetraitEvents → notifyTransactionEvents → notifyMessageEvents</p>
          <p>✅ <strong>Logs :</strong> [FCM_SEND_RESULT] [FCM_RECEIVED] [FCM_DISPLAY_SUCCESS] [FCM_DISPLAY_ERROR]</p>
        </CardContent>
      </Card>
    </div>
  );
}