import { submitConnectorActivation } from "./connector-authorization-commit.js";
import { randomUUID } from "node:crypto";
import { githubWhoami } from "@molis-ai/molis-work-integration-github";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";
import { pollGithubDeviceFlow, startGithubDeviceFlow } from "./github-oauth.js";
import { assertConnectorAuthorizationPending, beginConnectorAuthorization, finishConnectorAuthorization, pendingConnectorAuthorizations, expireConnectorAuthorizations } from "./connector-authorization-status.js";
import { checkConnectorSetupSubmission } from "./connector-setup-submission.js";
import { readConnectorAuthorizationPresentation, saveConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorProtocolSecrets, withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { PeriodicTasks } from "./periodic-tasks.js";

interface DeviceSession extends ConnectorProtocolConfiguration {
  protocol: "oauth";
  serviceId: "github";
  sessionId: string;
  clientId?: string;
  displayName?: string;
  previousRevision?: string;
  nextPollAt: number;
  interval: number;
}
const invalid = (message: string) => connectorErrors["connector.connection.invalid"](message);
const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(25_000) });
const local = (raw: string) => {
  const url = new URL(raw);
  if (!isLoopbackHttpOrigin(url)) throw invalid("设备授权必须从本机应用启动");
  return url.origin;
};

/** The browser receives a polling reference; the provider's device code stays in the credential owner. */
export async function startGithubConnection(home: string, input: { origin: string; clientId?: string; displayName?: string; connectionId?: string; setupId?: string }) {
  const origin = local(input.origin);
  checkConnectorSetupSubmission(home, input.setupId, { service_id: "github", method: "oauth", connection_id: input.connectionId });
  const previous = input.connectionId ? withConnectorConnections(home, store => store.require(input.connectionId!, "github")) : null;
  if (previous && previous.auth_method !== "oauth") throw invalid("请选择 GitHub OAuth 连接重新授权");
  const started = await startGithubDeviceFlow({ clientId: input.clientId, fetchImpl: boundedFetch })
    .catch(() => { throw invalid("无法开始 GitHub 设备授权，请检查应用配置或稍后重试"); });
  // A cancelled preparation cannot be claimed after the provider response returns.
  checkConnectorSetupSubmission(home, input.setupId, { service_id: "github", method: "oauth", connection_id: input.connectionId });
  const config: DeviceSession = { protocol: "oauth", serviceId: "github", connectionId: previous?.connection_id ?? randomUUID(), sessionId: randomUUID(),
    clientId: input.clientId, displayName: input.displayName, interval: Math.max(5, started.interval) * 1000,
    nextPollAt: Date.now() + Math.max(5, started.interval) * 1000, ...(previous ? { previousRevision: previous.updated_at } : {}) };
  const secrets = connectorProtocolSecrets(home, config.sessionId);
  secrets.put("access", started.deviceCode);
  const state = withConnectorProtocols(home, store => store.begin(origin, config));
  try {
    const authorizationId = beginConnectorAuthorization(home, state, config.connectionId, "github", Date.now(), input.setupId);
    saveConnectorAuthorizationPresentation(home, authorizationId, { authorization_url: started.verificationUri, user_code: started.userCode, device_state: state, origin });
    return { state, authorization_id: authorizationId, user_code: started.userCode, verification_uri: started.verificationUri,
      expires_in: Math.min(started.expiresIn, 600), interval: started.interval };
  } catch (error) { withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); throw error; }
}

export async function pollGithubConnection(home: string, input: { origin: string; state: string }) {
  const origin = local(input.origin), state = input.state;
  const config = withConnectorProtocols(home, store => store.read<DeviceSession>(state, origin)).configuration;
  if (config.protocol !== "oauth" || config.serviceId !== "github") throw invalid("设备授权方式不匹配");
  const secrets = connectorProtocolSecrets(home, config.sessionId);
  let terminal = false;
  try {
    assertConnectorAuthorizationPending(home, state);
    if (Date.now() < config.nextPollAt) return { status: "pending" };
    config.nextPollAt = Date.now() + 60_000;
    withConnectorProtocols(home, store => store.update(state, config));
    const deviceCode = secrets.get("access");
    if (!deviceCode) throw invalid("设备授权已失效，请重新开始");
    const result = await pollGithubDeviceFlow({ deviceCode, clientId: config.clientId, fetchImpl: boundedFetch });
    assertConnectorAuthorizationPending(home, state);
    if (result.status !== "authorized" || !result.accessToken) {
      if (!["pending", "slow_down"].includes(result.status)) { terminal = true; finishConnectorAuthorization(home, state, result.status === "expired" ? "expired" : result.status === "denied" ? "cancelled" : "failed"); }
      else { if (result.status === "slow_down") config.interval += 5000; config.nextPollAt = Date.now() + config.interval; withConnectorProtocols(home, store => store.update(state, config)); }
      return { status: result.status };
    }
    const identity = await githubWhoami({ token: result.accessToken, fetchImpl: boundedFetch });
    if (!identity.ok) throw invalid("无法验证 GitHub 账号，请重新授权");
    assertConnectorAuthorizationPending(home, state);
    const previous = config.previousRevision ? withConnectorConnections(home, store => store.require(config.connectionId, "github")) : null;
    if (previous && (previous.updated_at !== config.previousRevision || previous.account_label !== identity.login)) throw invalid("原连接或账号已变化，请新增连接或重新准备授权");
    // Claim the provider result once; a held result then lives in the encrypted authorization record.
    withConnectorProtocols(home, protocols => protocols.consume(state, origin)); terminal = true;
    const committed = submitConnectorActivation(home, state, { kind: "token", input: { serviceId: "github",
      displayName: previous?.display_name ?? config.displayName ?? `GitHub · ${identity.login}`, token: result.accessToken, accountLabel: identity.login, authMethod: "oauth" },
      ...(previous ? { target: { connectionId: previous.connection_id, expectedRevision: config.previousRevision } } : {}) });
    return committed.status === "pending" ? committed : { status: "authorized", connection_id: committed.connection.connection_id };
  } catch (error) { terminal = true; finishConnectorAuthorization(home, state, "failed"); throw error; }
  finally { if (terminal) { withConnectorProtocols(home, store => store.discard(state)); secrets.clear(); } }
}

/** OAuth device polling is protocol work on the existing Host timer registry, independent of any open page or model. */
export function registerConnectorDevicePolling(home: string, periodic: PeriodicTasks): void {
  periodic.every({ id: "connector-device-authorization", title: "完成设备登录授权", owner: "connectors", intervalMs: 2000,
    run: () => runWithMolisWorkHome(home, async () => {
      expireConnectorAuthorizations(home);
      await Promise.allSettled(pendingConnectorAuthorizations(home, "github").map(async request => {
        const ui = readConnectorAuthorizationPresentation(home, request.id);
        if (ui?.device_state && ui.origin) await pollGithubConnection(home, { state: ui.device_state, origin: ui.origin });
      }));
    }),
  });
}
