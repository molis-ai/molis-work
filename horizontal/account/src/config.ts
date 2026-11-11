import type { AccountEnvironmentConfig } from "@molis-ai/molis-work-contracts/services/account";
import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";
import { validateNamed } from "./upstream/validate.js";
import { accountErrors } from "./errors.js";

/** Parse only trusted startup configuration. No defaults silently enroll a client or enable mock. */
export function parseAccountEnvironment(input: unknown): AccountEnvironmentConfig {
  let value: unknown;
  try { value = typeof input === "string" ? JSON.parse(input) : structuredClone(input); }
  catch { throw accountErrors.invalid_configuration("Invalid account configuration"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw accountErrors.invalid_configuration("Invalid account configuration");
  const { applicationId, ...client } = value as Record<string, unknown>;
  if (!validateNamed("Id", applicationId) || !validateNamed("ClientEnvironmentConfig", client)) throw accountErrors.invalid_configuration("Invalid account configuration");
  const config = { ...client, applicationId } as AccountEnvironmentConfig;
  const auth = new URL(config.authOrigin), product = new URL(config.productOrigin);
  if (auth.origin !== config.authOrigin || product.origin !== config.productOrigin
    || !isLoopbackHttpOrigin(product, { numeric: true })
    || (config.environmentKind === "LOCAL" ? !isLoopbackHttpOrigin(auth, { numeric: true }) : auth.protocol !== "https:")) {
    throw accountErrors.invalid_configuration("Account origins do not match the environment");
  }
  for (const redirect of config.redirectAllowlist) {
    const url = new URL(redirect);
    if (url.origin !== product.origin || url.pathname !== "/account/callback" || url.search || url.hash
      || url.username || url.password || url.href !== redirect) throw accountErrors.invalid_configuration("Account callback must be the exact registered product callback");
  }
  Object.freeze(config.redirectAllowlist);
  return Object.freeze(config);
}
