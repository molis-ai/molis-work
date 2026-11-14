import configuration from "./release-profiles.json" with { type: "json" };

export type ReleaseProfileName = keyof typeof configuration.profiles;

export function releaseProfile(name: string) {
  if (!Object.hasOwn(configuration.profiles, name)) throw new Error("Choose a release profile: dev, test or release");
  return configuration.profiles[name as ReleaseProfileName];
}

export const releaseApplication = configuration.application;
export const releaseMacOS = configuration.macOS;
export const releaseRuntime = configuration.runtime;
export const connectorApplications = configuration.connectorApplications;

export function accountEnvironment(name: string) {
  if (!Object.hasOwn(configuration.accountEnvironments, name)) throw new Error("Choose dev, test or prod explicitly");
  const { port, ...config } = configuration.accountEnvironments[name as keyof typeof configuration.accountEnvironments];
  const productOrigin = `http://127.0.0.1:${port}`;
  return { ...config, productOrigin, policyProfile: configuration.accountPolicyProfile, redirectAllowlist: [productOrigin + "/account/callback"] };
}

export function connectorApplicationReferences(profile: string, service: string) {
  const { applicationRefs, applications } = releaseProfile(profile).connectors;
  const references: Readonly<Record<string, string>> = applicationRefs;
  const table = applications === null ? undefined : connectorApplications[applications as keyof typeof connectorApplications];
  const primary = Object.hasOwn(references, service) ? references[service]
    : table?.secretPrefix ? `${table.secretPrefix}${service.replaceAll("-", "_").toUpperCase()}` : undefined;
  return { primary, fallback: primary ? table?.fallbackMapRef ?? undefined : undefined };
}
