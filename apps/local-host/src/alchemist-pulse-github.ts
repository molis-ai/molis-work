import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { resolveApiConnection } from "./connector-access.js";
import { ConnectorConnectionError, withConnectorConnections, type ConnectorConnectionStore } from "./connector-connection-store.js";

/** The one binding the market pulse has: a Home-level choice, kept in the connection registry like Images' and TypeSafe's. */
const SCOPE = "home", CONSUMER = "alchemist", SLOT = "pulse-github";
const GITHUB_API_ORIGIN = "https://api.github.com";

/** Accounts the pulse can send a token for: a token or OAuth GitHub connection. A CLI login keeps its secret in the CLI. */
const lendsToken = (connection: { auth_method: string }) => connection.auth_method === "token" || connection.auth_method === "oauth";

/** Whether the request goes to GitHub's API itself: the exact origin, not a host that merely starts with it. */
function toGithubApi(url: string): boolean {
  try { return new URL(url).origin === GITHUB_API_ORIGIN; } catch { return false; }
}

/**
 * The token of the GitHub account bound to the pulse, resolved at each request through the same account-bound resolver
 * the other API readers use (`resolveApiConnection`): a token connection gives its stored token, and an OAuth connection
 * whose access token has expired is renewed with its refresh token first, so an account Settings shows as connected does
 * not get a 401 from GitHub. A renewed, replaced or disconnected token applies to the next request. Only a connection the
 * person explicitly bound counts: a GitHub account connected for Coding or Feed is not used until it is chosen here. When
 * nothing is bound, the bound account is disconnected, its secret cannot be read or renewed, or the registry cannot be
 * read, the pulse searches anonymously (a lower rate limit) rather than failing or trying another account. The process
 * environment is never consulted.
 */
async function boundToken(home: string): Promise<string | undefined> {
  try {
    const bound = withConnectorConnections(home, store => store.binding(SCOPE, CONSUMER, SLOT));
    if (!bound || !lendsToken(bound)) return undefined;
    return (await resolveApiConnection(home, bound.connection_id, "github")).token || undefined;
  } catch { return undefined; }
}

function read(home: string) {
  return withConnectorConnections(home, store => ({
    accounts: store.list("github").filter(lendsToken).map(connection => {
      const view = store.view(connection);
      return { connectionId: view.connection_id, displayName: view.display_name, accountLabel: view.account_label, state: view.state };
    }),
    selectedConnectionId: store.binding(SCOPE, CONSUMER, SLOT)?.connection_id ?? null,
  }));
}

function select(home: string, connectionId: string | null): void {
  try {
    withConnectorConnections(home, (store: ConnectorConnectionStore) => {
      if (connectionId === null) { store.unbind(SCOPE, CONSUMER, SLOT); return; }
      const connection = store.require(connectionId, "github");
      if (!lendsToken(connection)) throw new ActionError("alchemist.pulse_github_unusable", "这个 GitHub 连接是命令行登录，没有可由宿主发送的令牌。请选择令牌或授权登录的账号。");
      store.bind({ scopeId: SCOPE, pluginId: CONSUMER, slotId: SLOT, serviceId: "github", connectionId });
    });
  } catch (error) {
    if (error instanceof ConnectorConnectionError) throw new ActionError("alchemist.pulse_github_unusable", error.message);
    throw error;
  }
}

/**
 * The Host's side of the market pulse's GitHub source. The Authorization header is added here, to the requests the
 * plugin's client sends to api.github.com and to nothing else, after the request has left the plugin: the plugin
 * never receives the token, as a value or a getter, and neither it nor its database, reports or actions carry it.
 */
export function alchemistPulseGithub(home: string) {
  return {
    fetch: async (url: string, init: RequestInit): Promise<Response> => {
      const token = toGithubApi(url) ? await boundToken(home) : undefined;
      if (!token) return fetch(url, init);
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      return fetch(url, { ...init, headers });
    },
    read: () => read(home),
    select: (connectionId: string | null) => select(home, connectionId),
  };
}
