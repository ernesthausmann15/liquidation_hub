import { useEffect, useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, startSimulator, subscribe } from "./simulator";

/** Live simulator state; the first mounted widget starts the loop and the last one stops it. */
export function useLiveMarketplace() {
  useEffect(() => startSimulator(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
