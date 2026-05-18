/**
 * FcmAuditDashboard — Audit complet tokens FCM
 * Page admin : état push de chaque utilisateur + test push + nettoyage
 */
import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, RefreshCw, Send, Trash2, CheckCircle2, AlertCircle, XCircle, Smartphone, Wifi, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import moment from 'moment';

const STATUS_CONFIG = {
  ok:       { label: '✅ Token actif',    color: 'bg-green-100 text-green-800',  icon: CheckCircle2 },
  inactive: { label: '⚠️ Token inactif',  color: 'bg-amber-100 text-amber-800',  icon: AlertCircle },
  missing:  { label: '❌ Aucun token',     color: 'bg-red-100 text-red-800',      icon: XCircle },
};

const CAUSE_LABEL = {
  app_never_opened_or_permission_denied: 'App jamais ouverte ou permission refusée',
  user_never_logged_in_or_no_profile:   'Utilisateur jamais connecté / sans profil',
  token_expired_over_30_days:            'Token expiré (> 30 jours)',
  token_inactive_over_7_days:            'Token inactif (> 7 jours)',
  token_deactivated_recently:            'Token désactivé récemment',
};

function SummaryCard({ label, value, color }) {
  return (
    <div className={`rounded-xl p-3 text-center ${color}`}>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

function UserRow({ row, onSendTest, sending }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[row.status];
  const Icon = cfg.icon;

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      <div
        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(v => !v)}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{row.email}</p>
          <p className="text-xs text-muted-foreground truncate">
            {row.role || 'profil inconnu'}
            {row.last_seen ? ` · vu ${moment(row.last_seen).fromNow()}` : ''}
            {row.last_platform ? ` · ${row.last_platform}` : ''}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${cfg.color}`}>
          {row.active_count} actif{row.active_count !== 1 ? 's' : ''}
        </span>
        {row.duplicate_count > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold flex-shrink-0">
            {row.duplicate_count} dup
          </span>
        )}
        <button
          className="p-1 rounded hover:bg-gray-100 flex-shrink-0"
          onClick={e => { e.stopPropagation(); onSendTest(row.email); }}
          disabled={sending === row.email || row.status !== 'ok'}
          title="Envoyer push test"
        >
          {sending === row.email
            ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
            : <Send className="h-3.5 w-3.5 text-primary" />
          }
        </button>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t bg-gray-50 space-y-2">
          {/* Cause diagnostic */}
          {row.diag_cause && (
            <div className="p-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
              <strong>Cause probable :</strong> {CAUSE_LABEL[row.diag_cause] || row.diag_cause}
            </div>
          )}
          {/* Tokens */}
          {row.tokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun token en base</p>
          ) : row.tokens.map((t, i) => (
            <div key={t.id} className={`p-2 rounded-lg border text-xs space-y-0.5 ${t.is_active ? 'bg-green-50 border-green-200' : 'bg-gray-100 border-gray-200'}`}>
              <div className="flex justify-between">
                <span className="font-semibold">{t.is_active ? '✅' : '⚪'} Token #{i + 1} — {t.platform || t.device_type}</span>
                <span className="text-muted-foreground">{t.age_hours != null ? `${t.age_hours}h` : '—'}</span>
              </div>
              <p className="font-mono text-gray-500 break-all">{t.token_preview}</p>
              <p className="text-muted-foreground">
                Enregistré : {t.registered_at ? moment(t.registered_at).format('DD/MM HH:mm') : '—'} ·
                Utilisé : {t.last_used ? moment(t.last_used).format('DD/MM HH:mm') : '—'}
              </p>
              {t.device_id && <p className="text-muted-foreground">Device : {t.device_id}</p>}
            </div>
          ))}
          {/* Profils */}
          {row.profiles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {row.profiles.map((p, i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {p.type} ({p.status})
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FcmAuditDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanReport, setCleanReport] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('fcmAudit', { limit: 200 });
      setData(res.data);
    } catch (err) {
      toast.error('Erreur audit : ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendTest = async (email) => {
    setSending(email);
    try {
      const res = await base44.functions.invoke('sendTestPush', { target_email: email });
      const d = res.data;
      if (d?.fcm_sent > 0) {
        toast.success(`✅ Push envoyé à ${email}`);
      } else {
        toast.error(`⚠️ Échec pour ${email} : ${d?.note || d?.error || 'Aucun token'}`);
      }
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setSending(null);
    }
  };

  const cleanTokens = async (dryRun = true) => {
    setCleaning(true);
    try {
      const res = await base44.functions.invoke('cleanupFcmTokensAdmin', { dry_run: dryRun });
      const d = res.data;
      setCleanReport(d);
      if (dryRun) {
        toast(`Rapport : ${d.report?.total_to_delete || 0} tokens à nettoyer`);
      } else {
        toast.success(`✅ Nettoyage terminé : ${d.summary?.total_cleaned || 0} tokens supprimés`);
        load();
      }
    } catch (err) {
      toast.error('Erreur nettoyage : ' + err.message);
    } finally {
      setCleaning(false);
    }
  };

  const rows = (data?.rows || []).filter(r => {
    const matchSearch = !search || r.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const s = data?.summary;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🔔 Audit FCM — Tokens Push</h1>
          <p className="text-xs text-muted-foreground">
            {s?.generated_at ? `Généré ${moment(s.generated_at).fromNow()}` : ''}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Résumé */}
      {s && (
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard label="Utilisateurs" value={s.total_users} color="bg-blue-50 text-blue-800" />
          <SummaryCard label="Token actif" value={s.users_with_active_token} color="bg-green-50 text-green-800" />
          <SummaryCard label="Token inactif" value={s.users_with_inactive_token} color="bg-amber-50 text-amber-800" />
          <SummaryCard label="Sans token" value={s.users_without_token} color="bg-red-50 text-red-800" />
        </div>
      )}
      {s && (
        <div className="grid grid-cols-3 gap-2">
          <SummaryCard label="Total tokens BDD" value={s.total_tokens} color="bg-gray-50 text-gray-700" />
          <SummaryCard label="Actifs" value={s.total_active_tokens} color="bg-green-50 text-green-700" />
          <SummaryCard label="Doublons" value={s.total_duplicates} color={s.total_duplicates > 0 ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-500'} />
        </div>
      )}

      {/* Nettoyage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trash2 className="h-4 w-4" /> Nettoyage tokens
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => cleanTokens(true)} disabled={cleaning}>
              {cleaning ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Rapport (sans modifier)
            </Button>
            <Button variant="destructive" size="sm" className="flex-1" onClick={() => cleanTokens(false)} disabled={cleaning}>
              Nettoyer maintenant
            </Button>
          </div>
          {cleanReport && (
            <div className="p-2 rounded-lg bg-gray-50 border text-xs space-y-1">
              {cleanReport.dry_run ? (
                <p className="font-semibold text-amber-700">⚠️ Mode rapport — aucune suppression</p>
              ) : (
                <p className="font-semibold text-green-700">✅ Nettoyage appliqué</p>
              )}
              <p>Total tokens : <strong>{cleanReport.report?.total_tokens}</strong></p>
              <p>Actifs : <strong>{cleanReport.report?.active_tokens}</strong> · Inactifs : <strong>{cleanReport.report?.inactive_tokens}</strong></p>
              <p>Doublons exacts : <strong>{cleanReport.report?.exact_duplicates}</strong></p>
              <p>Doublons device : <strong>{cleanReport.report?.device_duplicates}</strong></p>
              <p>Anciens inactifs à supprimer : <strong>{cleanReport.report?.old_inactive_to_remove}</strong></p>
              <p className="font-semibold">Total à nettoyer : {cleanReport.report?.total_to_delete}</p>
              {cleanReport.summary && (
                <p className="text-green-700 font-semibold">Nettoyés : {cleanReport.summary.total_cleaned}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtres */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 border rounded-xl bg-white">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un email..."
            className="flex-1 outline-none text-sm bg-transparent"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'Tous' },
            { key: 'missing', label: '❌ Sans token' },
            { key: 'inactive', label: '⚠️ Inactifs' },
            { key: 'ok', label: '✅ Actifs' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                filterStatus === f.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-foreground border-border'
              }`}
            >
              {f.label}
              {f.key !== 'all' && data ? ` (${data.rows.filter(r => r.status === f.key).length})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Liste utilisateurs */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Aucun résultat</p>
        )}
        {rows.map(row => (
          <UserRow
            key={row.email}
            row={row}
            onSendTest={sendTest}
            sending={sending}
          />
        ))}
      </div>
    </div>
  );
}