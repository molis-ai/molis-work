import { readFileSync } from "node:fs";
import { parseAccountEnvironment } from "@molis-ai/molis-work-service-account";
import { releaseProfile } from "./release-profile.js";

function packagedReleaseProfile(): string | undefined {
  try { return readFileSync(new URL("./selected-release-profile", import.meta.url), "utf8").trim(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return undefined;
  }
}

const packaged = packagedReleaseProfile();

export function activeReleaseProfile(env: NodeJS.ProcessEnv = process.env) {
  return releaseProfile(packaged ?? env.MOLIS_WORK_RELEASE_PROFILE ?? "dev");
}

let localAccount: Readonly<{ encoded: string; generation: string; name: "dev" | "test"; syncOrigin: string }> | undefined;
const packagedAccount = packaged && releaseProfile(packaged).accountEnvironment
  ? JSON.parse(readFileSync(new URL("./selected-account-config.json", import.meta.url), "utf8")) as { account: unknown; syncOrigin?: string }
  : undefined;

export function configureLocalAccount(name: "dev" | "test", config: unknown, generation: string, syncOrigin: string): void {
  if (packaged || localAccount) throw new Error("Account environment was already selected");
  localAccount = Object.freeze({ encoded: JSON.stringify(config), generation, name, syncOrigin });
}

export function localAccountGeneration(): string | undefined {
  return localAccount?.generation;
}

export function localEnvironmentName(): "dev" | "test" | undefined {
  return localAccount?.name ?? (packaged === "test" ? "test" : undefined);
}

export function packagedDesktopHome(): string | undefined {
  return packaged ? releaseProfile(packaged).desktopApplication?.home : undefined;
}

export function configuredAccountEnvironment(env?: NodeJS.ProcessEnv): string | undefined {
  if (localAccount) return localAccount.encoded;
  if (packagedAccount) return JSON.stringify(packagedAccount.account);
  return (env ?? process.env).MOLIS_WORK_ACCOUNT_CONFIG;
}

export function configuredSyncOrigin(): string | undefined {
  return (localAccount?.syncOrigin ?? packagedAccount?.syncOrigin) || undefined;
}

export function describeAccountConfigState(env?: NodeJS.ProcessEnv):
  { configured: true; reason: "ok" } | { configured: false; reason: "missing_env" | "invalid_json" } {
  try {
    const raw = configuredAccountEnvironment(env);
    if (!raw) return { configured: false, reason: "missing_env" };
    parseAccountEnvironment(raw);
    return { configured: true, reason: "ok" };
  } catch {
    // A diagnosis must never expose the configuration or a parser error that includes it.
  }
  return { configured: false, reason: "invalid_json" };
}
