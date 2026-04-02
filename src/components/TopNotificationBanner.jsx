import { useState, useEffect, useRef } from 'react';
import { X, AlertCircle, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ICON_MAP = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertCircle,
  info: Clock,
};

const COLOR_MAP = {
  success: 'bg-green-50 border-green-300 text-green-800',
  error: 'bg-red-50 border-red-300 text-red-800',
  warning: 'bg-amber-50 border-amber-300 text-amber-800',
  info: 'bg-blue-50 border-blue-300 text-blue-800',
};

export default function TopNotificationBanner({ notification, onClose, autoCloseDuration = 8000 }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (autoCloseDuration && !notification?.persistent) {
      timerRef.current = setTimeout(() => {
        onClose();
      }, autoCloseDuration);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification, autoCloseDuration, onClose]);

  const handleInteraction = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (notification?.onAction) {
      notification.onAction();
    }
  };

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onClose();
  };

  if (!notification) return null;

  const Icon = ICON_MAP[notification.type || 'info'];
  const colorClass = COLOR_MAP[notification.type || 'info'];

  return (
    <div className="fixed top-0 left-0 right-0 z-[999] flex justify-center pt-4 px-4 animate-in slide-in-from-top-full duration-300">
      <div className={`w-full max-w-md rounded-lg border-2 p-4 shadow-lg ${colorClass}`}>
        <div className="flex items-start gap-3">
          <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {notification.title && (
              <p className="font-semibold text-sm">{notification.title}</p>
            )}
            {notification.message && (
              <p className="text-xs mt-1 opacity-90">{notification.message}</p>
            )}
            {notification.actions && (
              <div className="flex gap-2 mt-2">
                {notification.actions.map((action, idx) => (
                  <Button
                    key={idx}
                    size="sm"
                    className="h-7 text-xs"
                    variant={action.variant || 'default'}
                    onClick={() => {
                      handleInteraction();
                      if (action.onClick) action.onClick();
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 hover:opacity-70 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}