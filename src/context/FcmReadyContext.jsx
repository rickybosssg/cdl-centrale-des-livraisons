/**
 * FcmReadyContext — État global du boot FCM
 *
 * Expose :
 * - fcmReady : boolean — token confirmé en BDD
 * - fcmStatus : string — état détaillé pour logs/debug
 * - setFcmReady : setter utilisé par FcmBootstrap
 */
import { createContext, useContext, useState } from 'react';

const FcmReadyContext = createContext({
  fcmReady: false,
  fcmStatus: 'idle',
  setFcmReady: () => {},
  setFcmStatus: () => {},
});

export function FcmReadyProvider({ children }) {
  const [fcmReady, setFcmReady] = useState(false);
  const [fcmStatus, setFcmStatus] = useState('idle');

  return (
    <FcmReadyContext.Provider value={{ fcmReady, fcmStatus, setFcmReady, setFcmStatus }}>
      {children}
    </FcmReadyContext.Provider>
  );
}

export function useFcmReady() {
  return useContext(FcmReadyContext);
}