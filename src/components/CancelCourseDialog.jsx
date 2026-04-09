import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { triggerWhatsAppNotification, waMsgCourseCancelledClient, waMsgCourseCancelledDriver } from '@/lib/whatsappNotifications';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CancelCourseDialog({ open, onOpenChange, course, onSuccess }) {
  const [loading, setLoading] = useState(false);

  if (!course) return null;

  const prix = parseFloat(course.prix) || 0;
  const frais = Math.round(prix * 0.5);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('cancelCourseWithFees', {
        courseId: course.id,
      });

      if (res.data?.error === 'insufficient_balance') {
        toast.error(`❌ ${res.data.message}`);
      } else if (res.data?.success) {
        toast.success('✅ Course annulée. Frais prélevés.');
        // WA client
        triggerWhatsAppNotification({
          eventType: 'course_cancelled_by_client',
          recipientRole: 'client',
          recipientName: course.client_name || '',
          recipientPhone: course.telephone_expediteur,
          messageText: waMsgCourseCancelledClient(),
          entityId: course.id,
          entityType: 'course',
          priority: 'normal',
        });
        // WA livreur
        if (course.livreur_email && course.telephone_livreur) {
          triggerWhatsAppNotification({
            eventType: 'course_cancelled_driver',
            recipientRole: 'driver',
            recipientName: course.livreur_name || '',
            recipientPhone: course.telephone_livreur,
            messageText: waMsgCourseCancelledDriver(),
            entityId: course.id,
            entityType: 'course',
            priority: 'normal',
          });
        }
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(`Erreur: ${res.data?.error || 'Annulation échouée'}`);
      }
    } catch (err) {
      toast.error(`Erreur: ${err.message}`);
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
            Annulation avec frais
          </DialogTitle>
        </DialogHeader>

        <DialogDescription className="space-y-4">
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
        </DialogDescription>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button variant="destructive" className="flex-1" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Traitement...' : 'Confirmer annulation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}