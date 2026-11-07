import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { controlledConnectorFetch } from "@molis-ai/molis-work-plugin-sdk";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { catalogWhoami, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorReadFailure } from "./connector-access.js";
import { connectionTenantOrigin, serviceTenant } from "./connector-request-credentials.js";
import { rememberConnectorCheck } from "./connector-observations.js";
import { createGithubConnector } from "./github-connector.js";
import { createGmailConnector } from "./gmail-connector.js";

/**
 * A key checked before it is saved (§13.6 ④d, BL-1058): the key the person typed is asked of its service as it is, and nothing is written
 * until the service accepts it. A first key the service refuses leaves no connection; a replacement it refuses leaves the old key in use.
 * The candidate lives only in this request: it is not stored, logged, or kept with the check, and a refusal answers with the reader's code,
 * never the service's words (which could echo it back).
 */

/** The connection a replacement key is for, as read before the check: the check stops if it changes while the service answers. */
export interface CandidateTarget { connectionId: string; expectedRevision: string }

/** What a passed check read, kept with the connection once it is saved (the first check of that version, §13.2). */
export interface CandidateCheck { checked_at: string; account?: { login: string; account_id?: string } }

/** Keys this check can ask about: the services whose account a key alone can read (§13.2); others are checked where they are used. */
export function candidateCheckable(serviceId: string): boolean {
  return isCatalogConnectorId(serviceId) || serviceId === "github" || serviceId === "gmail";
}

/**
 * Where a replacement key may go (S-connector-candidate-key): a tenant's service is pinned to the site its connection was made for (BL-595), and a candidate
 * naming another site is refused here, before any request carries it. Read before the check sends anything.
 */
function assertCandidateDestination(home: string, serviceId: string, token: string, target: CandidateTarget | undefined): void {
  if (!target || !serviceTenant(serviceId)) return;
  const pinned = withConnectorConnections(home, store => {
    const row = store.require(target.connectionId, serviceId);
    if (row.updated_at !== target.expectedRevision) throw connectorErrors["connector.connection.invalid"]("原连接已变化，请刷新后再换密钥");
    return store.targetOrigin(row.connection_id);
  });
  const named = connectionTenantOrigin(serviceId, { token });
  if (!named) throw connectorErrors["connector.connection.invalid"]("无法确认账号所属的站点，请在「服务连接」里重新连接");
  if (pinned && pinned !== named) throw connectorErrors["connector.connection.service_mismatch"](`这条连接是 ${pinned} 的；要连 ${named}，请新增连接`);
}

/**
 * Ask the service about a key that is not saved. Returns `null` for a key only the place that uses it can check (a model, image or MCP
 * bearer key). Throws the read's coded failure (`connector.read.*`, `connector.check.rate_limited`) when the service refuses the key,
 * fails, or asks to wait; the caller then writes nothing.
 */
export async function checkCandidateKey(home: string, input: { serviceId: string; token: string; target?: CandidateTarget },
  caller: { signal?: AbortSignal } = {}): Promise<CandidateCheck | null> {
  const { serviceId, token, target } = input;
  if (!candidateCheckable(serviceId)) return null;
  assertCandidateDestination(home, serviceId, token, target);
  const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(caller.signal ? [caller.signal] : [])]);
  // A replacement stops when its connection changes (removed, renamed, another key put in) while the service is asked.
  const current = () => {
    signal.throwIfAborted();
    if (target && withConnectorConnections(home, store => store.get(target.connectionId))?.updated_at !== target.expectedRevision) {
      throw connectorErrors["connector.connection.invalid"]("原连接已变化，请刷新后再换密钥");
    }
  };
  const control: ConnectorCallControl = { signal, current, beforeEffect: async () => current() };
  const fetchImpl: typeof fetch = controlledConnectorFetch((request, init) => globalThis.fetch(request, init), control);
  const checked_at = () => new Date().toISOString();
  if (isCatalogConnectorId(serviceId)) {
    const result = await catalogWhoami({ connectorId: serviceId, token, fetchImpl });
    current();
    if (!result.ok) throw connectorReadFailure(result);
    return { checked_at: checked_at(), account: { login: result.login, ...(result.account_id ? { account_id: result.account_id } : {}) } };
  }
  const provider = runWithMolisWorkHome(home, () => serviceId === "github"
    ? createGithubConnector({ token, fetchImpl, allowFixture: false }) : createGmailConnector({ accessToken: token, fetchImpl, allowFixture: false }));
  const health = await provider.health(control);
  current();
  if (!health.ok) throw connectorReadFailure(health);
  return { checked_at: checked_at(), ...(health.account ? { account: health.account } : {}) };
}

/**
 * The passed check, kept as the first check of the version just saved, and the save's answer about it. Called right after the save, with
 * nothing awaited in between, so the version read is the one the check passed for.
 */
export function rememberCandidateCheck(home: string, connectionId: string, check: CandidateCheck) {
  const revision = withConnectorConnections(home, store => store.get(connectionId))?.updated_at;
  if (!revision || !rememberConnectorCheck(home, connectionId, { at: check.checked_at, revision, outcome: "connected", authorization: "verified",
    ...(check.account ? { account: check.account } : {}) })) return undefined;
  return { available: true as const, result: { connection_id: connectionId, ok: true, ...check } };
}
