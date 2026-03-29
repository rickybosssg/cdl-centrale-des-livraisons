/**
 * Hook pour les notifications navigateur (Web Notification API)
 * Aucune clé VAPID requise — fonctionne quand l'app est ouverte.
 * Demande la permission une seule fois, puis affiche des notifications système.
 */
export function useBrowserNotifications() {
  const requestPermission = async () => {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  };

  const showNotification = (titre, message, options = {}) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const notif = new Notification(titre, {
      body: message,
      icon: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
      badge: "https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg",
      tag: options.tag || "cdl-notif",
      ...options,
    });
    // Fermer automatiquement après 6 secondes
    setTimeout(() => notif.close(), 6000);
  };

  return { requestPermission, showNotification };
}