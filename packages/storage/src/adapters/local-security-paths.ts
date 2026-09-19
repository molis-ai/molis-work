import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import os from "node:os";

const homeScope = new AsyncLocalStorage<string>();

export const DEFAULT_HOME_DIRNAME = ".molis-work";
export const PROJECT_DATABASE_FILENAME = "molis-work.db";

export function readProductEnv(suffix: string, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return environment[`MOLIS_WORK_${suffix}`]?.trim() || undefined;
}

/** Explicit host context inherited by async work, without changing process.env. */
export function runWithMolisWorkHome<T>(homeDirectory: string, operation: () => T): T {
  return homeScope.run(path.resolve(homeDirectory), operation);
}

export function resolveMolisWorkHome(): string {
  const configured = homeScope.getStore() ?? readProductEnv("HOME");
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), DEFAULT_HOME_DIRNAME);
}

export function resolveProjectDatabaseFile(directory: string): string {
  return path.join(directory, PROJECT_DATABASE_FILENAME);
}

export function resolveFeedSecurityDirectory(): string {
  return path.join(resolveMolisWorkHome(), "feed");
}
