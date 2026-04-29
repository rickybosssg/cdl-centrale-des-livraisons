import NotificationPermissionRequest from "./NotificationPermissionRequest";

/**
 * Bannière intelligente de permissions notifications.
 * Toute la logique (step, localStorage, settings) est dans NotificationPermissionRequest.
 */
export default function NotificationPermissionBanner() {
  return (
    <NotificationPermissionRequest
      variant="banner"
      onSuccess={() => {}}
      onDismiss={() => {}}
    />
  );
}