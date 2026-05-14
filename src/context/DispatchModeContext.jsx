/**
 * DispatchModeContext (V1) — RE-EXPORT UNIQUEMENT
 *
 * Ce fichier est conservé pour la rétrocompatibilité des imports existants.
 * Il n'a AUCUN provider propre — tout passe par DispatchModeV2Provider (dans App.jsx).
 *
 * ⚠️ NE JAMAIS réintroduire de Provider, de toggle ou d'écriture ici.
 */
import { useDispatchModeV2 } from './DispatchModeV2Context';

export function useDispatchMode() {
  const v2 = useDispatchModeV2();
  return {
    mode: v2.mode,
    configId: v2.canonicalId,
    loading: v2.loading,
    toggle: v2.toggle,
    reload: v2.reload,
  };
}