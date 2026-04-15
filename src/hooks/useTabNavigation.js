import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const TAB_ROUTES = ['/', '/courses-disponibles', '/mes-livraisons', '/vitrines', '/dashboard-partenaire'];
const scrollCache = {};
const stateCache = {};

export function useTabNavigation() {
  const location = useLocation();
  const scrollContainerRef = useRef(null);

  // Déterminer la tab root
  const getRootTab = (path) => {
    for (const tab of TAB_ROUTES) {
      if (path === tab || path.startsWith(tab + '/')) return tab;
    }
    return '/';
  };

  const currentTab = getRootTab(location.pathname);
  const isRootTab = location.pathname === currentTab;

  // Sauvegarder le scroll avant de quitter
  useEffect(() => {
    if (!isRootTab && scrollContainerRef.current) {
      const previousTab = getRootTab(location.pathname);
      scrollCache[previousTab] = scrollContainerRef.current?.scrollTop || 0;
    }
  }, [location.pathname]);

  // Restaurer le scroll en arrivant
  useEffect(() => {
    if (isRootTab && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollCache[currentTab] || 0;
        }
      }, 0);
    }
  }, [currentTab, isRootTab]);

  return {
    scrollContainerRef,
    currentTab,
    isRootTab,
    cacheState: (key, state) => { stateCache[`${currentTab}_${key}`] = state; },
    getState: (key) => stateCache[`${currentTab}_${key}`],
  };
}