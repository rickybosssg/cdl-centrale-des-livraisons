import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { triggerWhatsAppNotification } from '@/lib/whatsappNotifications';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

/** Annulation sans frais (pas encore de livreur confirmé ou en attente de réponse) */
const FREE_CANCEL_STATUTS = ['en_attente', 'assignee_attente', 'aucun_livreur'];

async function releaseLivreurIfPending(course) {
  if (!course?.livreur_email || course.statut !== 'assignee_attente') return;
  try {
    const livs = await base44.entities.User.filter({ email: course.livreur_email });
    if (livs?.[0]) {
      await base44.entities.User.update(livs[0].id, {
        nombre_courses_actives: Math.max(0, (livs[0].nombre_courses_actives || 1) - 1),
      });
    }
  } catch (e) {
    console.warn('[CancelCourseDialog] release livreur:', e?.message);
  }
}

export default function CancelCourseDialog({ open, onOpenChange, course, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!course) return null;

  const prix = parseFloat(course.prix) || 0;
  const frais = Math.round(prix * 0.5);
  const isFreeCancel = FREE_CANCEL_STATUTS.includes(course.statut);

  const handleConfirm = async () => {
    if (loading) return;
    setErrorMsg(null);
    setLoading(true);
    console.log('[CancelDialog] Annulation course:', course.id, 'statut:', course.statut, 'gratuit:', isFreeCancel);

    try {
      // ── Annulation gratuite : ne pas appeler cancelCourseWithFees (réservé à acceptee / en_cours côté backend)
      if (isFreeCancel) {
        await base44.entities.Course.update(course.id, {
          statut: 'annulee',
          annulee_par: 'client',
          frais_annulation: 0,
          date_annulation: new Date().toISOString(),
        });
        await releaseLivreurIfPending(course);
        toast.success('✅ Course annulée sans frais.');
        onOpenChange(false);
        onSuccess?.();
        return;
      }

      // ── Annulation avec frais (livreur a accepté)
      const res = await base44.functions.invoke('cancelCourseWithFees', { courseId: course.id });
      console.log('[CancelDialog] Réponse:', res?.data);

      if (res?.data?.error === 'insufficient_balance') {
        const msg = res.data.message || 'Solde insuffisant';
        setErrorMsg(msg);
        toast.error('❌ ' + msg);
        return;
      }
      if (res?.data?.success) {
        toast.success('✅ Course annulée. Frais prélevés si applicable.');
        triggerWhatsAppNotification({
          eventType: 'course_cancelled_by_client',
          recipientRole: 'client',
          recipientName: course.client_name || '',
          recipientPhone: course.telephone_expediteur,
          entityId: course.id,
          entityType: 'course',
          priority: 'normal',
        });
        if (course.livreur_email && course.telephone_livreur) {
          triggerWhatsAppNotification({
            eventType: 'course_cancelled_driver',
            recipientRole: 'driver',
            recipientName: course.livreur_name || '',
            recipientPhone: course.telephone_livreur,
            entityId: course.id,
            entityType: 'course',
            priority: 'normal',
          });
        }
        onOpenChange(false);
        onSuccess?.();
        return;
      }

      const msg = res?.data?.message || res?.data?.error || 'Annulation échouée';
      console.error('[CancelDialog] Erreur:', msg);
      setErrorMsg(msg);
      toast.error('Erreur: ' + msg);
    } catch (err) {
      console.error('[CancelDialog] Exception:', err?.message);
      setErrorMsg(err.message);
      toast.error('Erreur: ' + (err.message || 'inconnue'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {isFreeCancel ? 'Annuler la course' : 'Annulation avec frais'}
          </DialogTitle>
        </DialogHeader>

        <DialogDescription className="space-y-4">
          {isFreeCancel ? (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm text-green-900">
                Aucun frais ne sera prélevé. La course sera marquée comme annulée.
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-sm text-amber-900">
                  Cette course a déjà été acceptée par un livreur. Si vous annulez maintenant, <strong>{frais}F</strong> seront prélevés automatiquement sur votre Bedou (50% du prix).
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs bg-muted/50 p-3 rounded-lg">
                <div className="text-center">
                  <p className="font-bold text-primary">{prix}F</p>
                  <p className="text-muted-foreground">Prix course</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-amber-600">-{frais}F</p>
                  <p className="text-muted-foreground">Frais (50%)</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-green-600">{prix - frais}F</p>
                  <p className="text-muted-foreground">Remboursé</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Sur les frais : 20% à CDL (compensation) et 80% au livreur (compensation).
              </p>
            </>
          )}
        </DialogDescription>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            ⚠️ {errorMsg}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
            Fermer
          </Button>
          <Button variant="destructive" className="flex-1" onClick={handleConfirm} disabled={loading}>
            {loading ? (
              <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Traitement...</>
            ) : (
              'Confirmer annulation'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
