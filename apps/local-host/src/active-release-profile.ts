import { readFileSync } from "node:fs";
import { parseAccountEnvironment } from "@molis-ai/molis-work-service-account";
import { accountEnvironment, releaseProfile } from "./release-profile.js";

function packagedReleaseProfile(): string | undefined {
  try { return readFileSync(new URL("./selected-release-profile", import.meta.url), "utf8").trim(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return undefined;
  }
}

const packaged = packagedReleaseProfile();

export function activeReleaseProfile(env: NodeJS.ProcessEnv = process.env) {
  return releaseProfile(env.MOLIS_WORK_RELEASE_PROFILE ?? packaged ?? "dev");
}

export function configuredAccountEnvironment(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.MOLIS_WORK_ACCOUNT_CONFIG !== undefined) return env.MOLIS_WORK_ACCOUNT_CONFIG;
  const profile = env.MOLIS_WORK_RELEASE_PROFILE ?? packaged;
  // Opening the normal dev build without an account configuration continues to support local use.
  if (profile === undefined || profile === "dev") return undefined;
  const preset = releaseProfile(profile).accountEnvironment;
  return preset ? JSON.stringify(accountEnvironment(preset)) : undefined;
}

export function describeAccountConfigState(env: NodeJS.ProcessEnv = process.env):
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
