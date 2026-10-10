import type { SourceFetch } from "./http-source-client.js";

export interface AlchemistPulseGithubAccount {
  connectionId: string;
  displayName: string;
  accountLabel: string | null;
  state: "connected" | "disconnected" | "reauth_required";
}

/**
 * What the Host lends the market pulse for GitHub, and the only way a GitHub credential takes part in it.
 *
 * `fetch` sends the pulse's requests; for `https://api.github.com/` the Host adds the credential header of the account
 * the person bound to the pulse, after the request has left this package, and sends none when no account is bound. The
 * token itself is never given to the plugin: not as a value, not as a getter, not in an action's input or output. The
 * other two members only name accounts: Settings connections the person may bind (a token or OAuth GitHub account) and
 * the one that is bound now (null: anonymous).
 */
export interface AlchemistPulseGithubPort {
  fetch: SourceFetch;
  read(): { accounts: AlchemistPulseGithubAccount[]; selectedConnectionId: string | null };
  /** Binds one account, or none (null: search anonymously). Throws an `ActionError` (shown to the person as is) when the account cannot be used. */
  select(connectionId: string | null): void;
}
