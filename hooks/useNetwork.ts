import { useState, useEffect } from "react";
import * as Network from "expo-network";

export const useNetworkStatus = () => {
  const [isConnected, setIsConnected] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    let subscription: { remove: () => void } | null = null;

    Network.getNetworkStateAsync()
      .then((state) => {
        if (isMounted) {
          setIsConnected(Boolean(state.isConnected && state.isInternetReachable !== false));
        }
      })
      .catch(() => {});

    subscription = Network.addNetworkStateListener((state) => {
      if (isMounted) {
        setIsConnected(Boolean(state.isConnected && state.isInternetReachable !== false));
      }
    });

    return () => {
      isMounted = false;
      if (subscription) subscription.remove();
    };
  }, []);

  return { isConnected };
};