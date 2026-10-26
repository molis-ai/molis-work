import { AsyncLocalStorage } from "node:async_hooks";
import { realpathSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const homeScope = new AsyncLocalStorage<string>();

export const DEFAULT_HOME_DIRNAME = ".molis-work";
export const PROJECT_DATABASE_FILENAME = "molis-work.db";

export function readProductEnv(suffix: string, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  return environment[`MOLIS_WORK_${suffix}`]?.trim() || undefined;
}

/**
 * The Home as its real path, resolved here and nowhere else (S-11, user 2026-10-26): `--home`, MOLIS_WORK_HOME, the default and the
 * Host's scope all come through this, so the Home snapshot and the uninstall purge, which refuse a store path that is not its own
 * real path, work for a Home reached through a link. Only the Home's own path is resolved; a link inside the Home is still refused
 * where it is read. What does not exist yet stays as written, under the real path of the nearest directory that does.
 */
export function resolveHomeDirectory(candidate: string): string {
  const absolute = path.resolve(candidate), missing: string[] = [];
  for (let probe = absolute; ; probe = path.dirname(probe)) {
    try { return path.join(realpathSync(probe), ...missing); } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = path.dirname(probe);
      if (parent === probe) return absolute;
      missing.unshift(path.basename(probe));
    }
  }
}

/** Explicit host context inherited by async work, without changing process.env. */
export function runWithMolisWorkHome<T>(homeDirectory: string, operation: () => T): T {
  return homeScope.run(resolveHomeDirectory(homeDirectory), operation);
}

export function resolveMolisWorkHome(): string {
  const scoped = homeScope.getStore();
  if (scoped) return scoped;
  return resolveHomeDirectory(readProductEnv("HOME") ?? path.join(os.homedir(), DEFAULT_HOME_DIRNAME));
}

export function resolveProjectDatabaseFile(directory: string): string {
  return path.join(directory, PROJECT_DATABASE_FILENAME);
}

export function resolveHomeSecurityDirectory(): string {
  return path.join(resolveMolisWorkHome(), "feed");
}
