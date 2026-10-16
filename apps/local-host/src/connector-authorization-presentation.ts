import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { cancelGmailOAuthFlow } from "./gmail-oauth.js";
import { cancelNotionOAuthFlow } from "./notion-oauth.js";
import { clearOAuthConnectionTarget } from "./connector-oauth-targets.js";

/** Protocol UI state is never part of the model-facing status. Codes stay inside the protected form. */
export interface ConnectorAuthorizationPresentation { authorization_url?: string; user_code?: string; device_state?: string; origin?: string }
interface StoredPresentation extends ConnectorAuthorizationPresentation { protocol?: { state: string; service: string } }
const reference = (id: string) => {
  if (!/^[0-9a-f-]{36}$/u.test(id)) throw new Error("接入请求标识无效");
  return `connector-authorization:${id}:presentation`;
};
export function saveConnectorAuthorizationPresentation(home: string, id: string, value: ConnectorAuthorizationPresentation): void {
  if (value.authorization_url) {
    const url = new URL(value.authorization_url);
    if ((url.protocol !== "https:" && !isLoopbackHttpUrl(url)) || url.username || url.password) throw new Error("服务返回的授权地址无效");
  }
  runWithMolisWorkHome(home, () => createFileSecretStore().put(reference(id), JSON.stringify({ ...readStored(home, id), ...value })));
}
function readStored(home: string, id: string): StoredPresentation | undefined {
  const value = runWithMolisWorkHome(home, () => createFileSecretStore().get(reference(id)));
  return value ? JSON.parse(value) as StoredPresentation : undefined;
}
export function bindConnectorAuthorizationProtocol(home: string, id: string, state: string, service: string): void {
  runWithMolisWorkHome(home, () => createFileSecretStore().put(reference(id), JSON.stringify({ ...readStored(home, id), protocol: { state, service } })));
}
export function readConnectorAuthorizationPresentation(home: string, id: string): ConnectorAuthorizationPresentation | undefined {
  const value = readStored(home, id);
  if (!value) return undefined;
  const { protocol, ...presentation } = value;
  return presentation;
}
export function clearConnectorAuthorizationPresentation(home: string, id: string): void {
  const protocol = readStored(home, id)?.protocol;
  if (protocol) {
    withConnectorProtocols(home, store => store.discard(protocol.state));
    runWithMolisWorkHome(home, () => {
      if (protocol.service === "gmail") { cancelGmailOAuthFlow(protocol.state); clearOAuthConnectionTarget("gmail", protocol.state); }
      if (protocol.service === "notion") cancelNotionOAuthFlow(protocol.state);
    });
  }
  runWithMolisWorkHome(home, () => createFileSecretStore().delete(reference(id)));
}
