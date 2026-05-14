/**
 * DispatchModeContext (V1) — WRAPPER PASSIF VERS V2
 *
 * Ce context est conservé pour la rétrocompatibilité (composants qui utilisent useDispatchMode).
 * Il délègue TOUT au DispatchModeV2Context — AUCUNE écriture propre, AUCUN toggle propre.
 * La source unique de vérité est DispatchModeV2Context.
 *
 * ⚠️ NE JAMAIS réintroduire de logique de toggle ou d'écriture ici.
 */
import { createContext, useContext } from 'react';
import { useDispatchModeV2 } from './DispatchModeV2Context';

const DispatchModeContext = createContext(null);

export function DispatchModeProvider({ children }) {
  // Le V1 est maintenant un shell vide — le vrai provider est DispatchModeV2Provider (dans App.jsx)
  // On expose le context via un provider enfant qui lira depuis V2
  return (
    <DispatchModeContext.Provider value={null}>
      {children}
    </DispatchModeContext.Provider>
  );
}

export function useDispatchMode() {
  // Déléguer directement au V2 — source unique de vérité
  const v2 = useDispatchModeV2();
  return {
    mode: v2.mode,
    configId: v2.canonicalId,
    loading: v2.loading,
    toggle: v2.toggle,
    reload: v2.reload,
  };
}