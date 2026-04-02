import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Composant wrapper qui track les vues d'une publicité via IntersectionObserver.
 * Ne compte qu'une vue par affichage réel.
 */
export default function PubliciteTracker({ publiciteId, userRole = 'client', children }) {
  const ref = useRef(null);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!publiciteId || !ref.current) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        entries.forEach((entry) => {
          // Déclencher le tracking UNIQUEMENT quand la pub devient visible
          if (entry.isIntersecting && !trackedRef.current) {
            trackedRef.current = true;
            trackView();
          }
          // Réinitialiser quand elle sort de l'écran
          if (!entry.isIntersecting) {
            trackedRef.current = false;
          }
        });
      },
      { threshold: 0.5 } // Au moins 50% visible
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [publiciteId]);

  const trackView = async () => {
    try {
      const user = await base44.auth.me();
      await base44.functions.invoke('trackPubliciteInteraction', {
        publicite_id: publiciteId,
        interaction_type: 'view',
        user_id: user?.id,
        user_email: user?.email,
        user_role: userRole,
      });
    } catch (err) {
      console.error('[PubliciteTracker] View tracking error:', err);
    }
  };

  return <div ref={ref}>{children}</div>;
}