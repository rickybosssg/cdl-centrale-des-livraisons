import { createContext, useContext, useState, useCallback } from 'react';

const TopNotificationContext = createContext();

export function TopNotificationProvider({ children }) {
  const [notification, setNotification] = useState(null);

  const showNotification = useCallback((options) => {
    setNotification({
      id: Date.now(),
      type: 'info',
      persistent: false,
      autoCloseDuration: 8000,
      ...options,
    });
  }, []);

  const closeNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return (
    <TopNotificationContext.Provider value={{ notification, showNotification, closeNotification }}>
      {children}
    </TopNotificationContext.Provider>
  );
}

export function useTopNotification() {
  const context = useContext(TopNotificationContext);
  if (!context) {
    throw new Error('useTopNotification doit être utilisé dans TopNotificationProvider');
  }
  return context;
}