import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { createGithubConnector, githubWhoami } from "./github-connector.js";
import { createGmailConnector } from "./gmail-connector.js";

/**
 * The built-in integrations whose account a token reads directly (D3 A, M11): the one Host table of them, read by the connection
 * check, the key check before a save, the record preview and the account read. Everything else dispatches on whether a service has
 * a reader here and never names one. A catalog service is read by the catalog integration's own declarations.
 */
export interface AccountReader {
  /** A provider that reads with a token in hand (a check, a preview). */
  withToken(input: { token: string; fetchImpl: typeof fetch }): IntegrationProviderPort;
  /** Who the token belongs to, with the grants the service reports; absent: the provider's health names the account. */
  whoami?(input: { token: string; fetchImpl: typeof fetch }): Promise<{ ok: true; login: string; scopes: readonly string[]; account_id?: string } | { ok: false; failure: string; message: string }>;
}

const READERS: Readonly<Record<string, AccountReader>> = Object.freeze({
  github: {
    withToken: ({ token, fetchImpl }) => createGithubConnector({ token, fetchImpl, allowFixture: false }),
    whoami: ({ token, fetchImpl }) => githubWhoami({ token, fetchImpl }),
  },
  gmail: { withToken: ({ token, fetchImpl }) => createGmailConnector({ accessToken: token, fetchImpl, allowFixture: false }) },
});

/** The reader of `service`'s account, if a built-in integration gives one. */
export function accountReader(service: string): AccountReader | undefined {
  return Object.hasOwn(READERS, service) ? READERS[service] : undefined;
}

/** A provider reading `service` with a token in hand, in `home`. */
export function accountProviderWithToken(home: string, service: string, input: { token: string; fetchImpl: typeof fetch }): IntegrationProviderPort | undefined {
  const reader = accountReader(service);
  return reader && runWithMolisWorkHome(home, () => reader.withToken(input));
}

