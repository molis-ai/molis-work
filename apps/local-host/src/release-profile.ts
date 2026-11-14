import configuration from "./release-profiles.json" with { type: "json" };

export type ReleaseProfileName = keyof typeof configuration.profiles;

export function releaseProfile(name: string) {
  if (!Object.hasOwn(configuration.profiles, name)) throw new Error("Choose a release profile: dev, test or release");
  return configuration.profiles[name as ReleaseProfileName];
}

export const releaseApplication = configuration.application;
export const releaseMacOS = configuration.macOS;
export const releaseRuntime = configuration.runtime;

export function accountEnvironment(name: string) {
  if (!Object.hasOwn(configuration.accountEnvironments, name)) throw new Error("Choose dev, test or prod explicitly");
  const { port, ...config } = configuration.accountEnvironments[name as keyof typeof configuration.accountEnvironments];
  const productOrigin = `http://127.0.0.1:${port}`;
  return { ...config, productOrigin, policyProfile: "unified-account-v2", redirectAllowlist: [productOrigin + "/account/callback"] };
}

export function connectorApplicationReference(profile: string, service: string): `OAUTH_APP_${string}` | undefined {
  const prefix = releaseProfile(profile).connectors.applicationSecretPrefix;
  return prefix ? `${prefix}${service.replaceAll("-", "_").toUpperCase()}` as `OAUTH_APP_${string}` : undefined;
}
