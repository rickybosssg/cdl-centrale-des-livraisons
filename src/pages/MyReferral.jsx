import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Copy, Share2, Users, TrendingUp, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function MyReferral() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [referralCode, setReferralCode] = useState(null);
  const [referralLink, setReferralLink] = useState(null);
  const [myReferrals, setMyReferrals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await base44.auth.me();
        setUser(me);

        // Obtenir ou générer le code promo
        const codeRes = await base44.functions.invoke('ensureUserReferralCode', {});
        if (codeRes.data.success) {
          setReferralCode(codeRes.data.code);
          setReferralLink(codeRes.data.link);
        }

        // Charger les filleuls
        const referrals = await base44.entities.UserReferral.filter({
          referrer_email: me.email,
          status: 'active',
        }, '-created_date', 100);

        setMyReferrals(referrals || []);

        // Calculer stats
        const totalFilleuls = referrals?.length || 0;
        const signupBonusCount = (referrals || []).filter(r => r.signup_bonus_paid).length;
        const courseBonusCount = (referrals || []).filter(r => r.first_course_bonus_paid).length;
        const totalBonus = (referrals || []).reduce((sum, r) => sum + (r.total_bonus || 0), 0);

        setStats({
          totalFilleuls,
          signupBonusCount,
          courseBonusCount,
          totalBonus,
        });
      } catch (e) {
        console.error('[MyReferral] Error:', e);
        toast.error('Erreur chargement parrainage');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleCopyCode = () => {
    if (referralCode) {
      navigator.clipboard.writeText(referralCode);
      toast.success('Code copié');
      setCopying(false);
    }
  };

  const handleCopyLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink);
      toast.success('Lien copié');
      setCopying(false);
    }
  };

  const handleShareWhatsApp = () => {
    const message = `Rejoins CDL avec mon code promo ${referralCode} et gagne des réductions ! ${referralLink}`;
    const waLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waLink, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Mon parrainage</h1>
          <p className="text-xs text-muted-foreground">Gagnez 200F par filleul</p>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-primary/5">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{stats?.totalFilleuls || 0}</p>
            <p className="text-xs text-muted-foreground">Filleuls</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50">
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{stats?.totalBonus || 0}F</p>
            <p className="text-xs text-muted-foreground">Gains totaux</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">+{(stats?.signupBonusCount || 0) * 100}F</p>
            <p className="text-xs text-muted-foreground">Inscriptions</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">+{(stats?.courseBonusCount || 0) * 100}F</p>
            <p className="text-xs text-muted-foreground">Premières courses</p>
          </CardContent>
        </Card>
      </div>

      {/* Mon lien de parrainage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Mon lien de parrainage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Code promo</label>
            <div className="flex gap-2">
              <Input value={referralCode || ''} disabled className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleCopyCode}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Lien complet</label>
            <div className="flex gap-2">
              <Input value={referralLink || ''} disabled className="flex-1 text-[10px]" />
              <Button size="sm" variant="outline" onClick={handleCopyLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button className="w-full" onClick={handleShareWhatsApp}>
            <Share2 className="h-4 w-4 mr-2" /> Partager sur WhatsApp
          </Button>
        </CardContent>
      </Card>

      {/* Mes filleuls */}
      <div>
        <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Users className="h-4 w-4" /> Mes filleuls ({myReferrals.length})
        </h2>

        {myReferrals.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Aucun filleul pour le moment. Partagez votre lien pour en ajouter !
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {myReferrals.map(referral => (
            <Card key={referral.id}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{referral.referred_email}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    {referral.total_bonus || 0}F
                  </span>
                </div>

                <div className="flex gap-2 text-xs text-muted-foreground">
                  {referral.signup_bonus_paid && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      ✅ Inscription
                    </span>
                  )}
                  {referral.first_course_bonus_paid && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      ✅ 1ère course
                    </span>
                  )}
                  {!referral.signup_bonus_paid && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      ⏳ En attente
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Inscription : {moment(referral.created_date).format('DD/MM/YYYY HH:mm')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}