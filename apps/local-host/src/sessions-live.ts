import { resolve } from "node:path";
import type { HostSessions } from "./sessions-actions.js";

/** The running external-sessions service of each Home in this process, keyed by resolved Home path. */
const running = new Map<string, HostSessions>();

export const liveSessions = (home: string): HostSessions | undefined => running.get(resolve(home));

export function setLiveSessions(home: string, host: HostSessions): () => void {
  const key = resolve(home);
  running.set(key, host);
  return () => {
    if (running.get(key) === host) running.delete(key);
  };
}

export function notifySessionsDirectoriesChanged(home: string): void {
  running.get(resolve(home))?.service.directoriesChanged();
}
