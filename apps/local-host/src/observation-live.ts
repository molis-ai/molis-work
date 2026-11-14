import { resolve } from "node:path";
import type { HostObservation } from "./observation-host.js";

/** The running observation layer of each Home in this process, by its resolved path: what happens to a Home's data reaches it through its Home, not the Host object. */
const running = new Map<string, HostObservation>();

export const liveObservation = (home: string): HostObservation | undefined => running.get(resolve(home));

/** Make `host` the Home's running layer; answers how to step down, which leaves a later layer of the same Home in place. */
export function setLiveObservation(home: string, host: HostObservation): () => void {
  const key = resolve(home);
  running.set(key, host);
  return () => { if (running.get(key) === host) running.delete(key); };
}
