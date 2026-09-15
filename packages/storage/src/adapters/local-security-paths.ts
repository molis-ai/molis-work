import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const homeScope = new AsyncLocalStorage<string>();

export const DEFAULT_HOME_DIRNAME = ".molis-work";
export const LEGACY_HOME_DIRNAME = ".goalboard";
export const PROJECT_DATABASE_FILENAME = "molis-work.db";
export const LEGACY_PROJECT_DATABASE_FILENAME = "goalboard.db";

export function readProductEnv(suffix: string, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const next = environment[`MOLIS_WORK_${suffix}`]?.trim();
  if (next) return next;
  const legacy = environment[`GOALBOARD_${suffix}`]?.trim();
  return legacy || undefined;
}

/** Explicit host context inherited by async work, without changing process.env. */
export function runWithMolisWorkHome<T>(homeDirectory: string, operation: () => T): T {
  return homeScope.run(path.resolve(homeDirectory), operation);
}

export function migrateLegacyHomeDirectory(nextHome: string, legacyHome: string): string {
  const next = path.resolve(nextHome);
  const legacy = path.resolve(legacyHome);
  if (next === legacy) return next;
  try {
    if (!fs.existsSync(next) && fs.existsSync(legacy)) fs.renameSync(legacy, next);
  } catch {
    return fs.existsSync(next) ? next : legacy;
  }
  if (fs.existsSync(next) && !fs.existsSync(legacy)) {
    try {
      fs.symlinkSync(next, legacy);
    } catch {
      /* Old absolute paths keep working when this succeeds; missing symlink is not fatal. */
    }
  }
  return fs.existsSync(next) ? next : legacy;
}

export function resolveMolisWorkHome(): string {
  const configured = homeScope.getStore() ?? readProductEnv("HOME");
  if (configured) return path.resolve(configured);
  return migrateLegacyHomeDirectory(
    path.join(os.homedir(), DEFAULT_HOME_DIRNAME),
    path.join(os.homedir(), LEGACY_HOME_DIRNAME),
  );
}

export function resolveProjectDatabaseFile(directory: string): string {
  const next = path.join(directory, PROJECT_DATABASE_FILENAME);
  const legacy = path.join(directory, LEGACY_PROJECT_DATABASE_FILENAME);
  if (fs.existsSync(next)) return next;
  if (fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, next);
      return next;
    } catch {
      return legacy;
    }
  }
  return next;
}

export function resolveFeedSecurityDirectory(): string {
  return path.join(resolveMolisWorkHome(), "feed");
}
