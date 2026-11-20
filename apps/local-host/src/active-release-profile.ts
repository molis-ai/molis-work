import { readFileSync } from "node:fs";
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
  return releaseProfile(packaged ?? (env.NODE_TEST_CONTEXT ? env.MOLIS_WORK_RELEASE_PROFILE : undefined) ?? "dev");
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
  return localAccount?.encoded ?? (packagedAccount ? JSON.stringify(packagedAccount.account) : undefined) ??
    (env ?? (process.env.NODE_TEST_CONTEXT ? process.env : undefined))?.MOLIS_WORK_ACCOUNT_CONFIG;
}

export function configuredSyncOrigin(): string | undefined {
  return (localAccount?.syncOrigin ?? packagedAccount?.syncOrigin) || undefined;
}
