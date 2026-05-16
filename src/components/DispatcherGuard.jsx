import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { isAdminUser } from '@/lib/activeProfile';

export default function DispatcherGuard() {
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => {
      // Source unique: user.role === 'admin'
      setAllowed(isAdminUser(user));
    });
  }, []);

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <p className="text-xl font-bold">Accès refusé</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Cette section est réservée à l'administration CDL.
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}