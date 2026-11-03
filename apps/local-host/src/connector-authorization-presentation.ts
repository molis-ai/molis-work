import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import { cancelNotionOAuthFlow } from "./notion-oauth.js";
import { cleanupConnectorInstallation } from "./connector-tool-cleanup.js";
import type { ConnectorActivation } from "./connector-activation.js";

/** Protocol UI state is never part of the model-facing status. Codes stay inside the protected form. */
interface ConnectorAuthorizationPresentation { authorization_url?: string; user_code?: string; device_state?: string; origin?: string; cli_job?: string }
interface StoredPresentation extends ConnectorAuthorizationPresentation { protocol?: { state: string; service: string }; completion?: ConnectorActivation; installation_id?: string; installation_ready?: boolean }
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
  if (!value || value.completion) return undefined;
  const { protocol, completion, installation_id, installation_ready, ...presentation } = value;
  return presentation;
}
export function saveConnectorAuthorizationCompletion(home: string, id: string, completion: ConnectorActivation): void {
  const value = readStored(home, id);
  if (!value?.protocol) throw new Error("接入协议已结束");
  runWithMolisWorkHome(home, () => createFileSecretStore().put(reference(id), JSON.stringify({ ...value, completion })));
}
/** Track the owned candidate before installation starts, so cancellation and expiry can reclaim it. */
export function bindConnectorAuthorizationInstallation(home: string, id: string, installationId: string, ready = false): void {
  const value = readStored(home, id);
  if (!value?.protocol) throw new Error("接入协议已结束");
  runWithMolisWorkHome(home, () => createFileSecretStore().put(reference(id), JSON.stringify({ ...value, installation_id: installationId, installation_ready: ready })));
}
/** Resource ownership, without credentials or protocol completion material. */
export function connectorAuthorizationInstallation(home: string, id: string) {
  const value = readStored(home, id);
  return value?.installation_id ? { id: value.installation_id, ready: value.installation_ready === true } : undefined;
}
/** Host-only material; the public page and Agent status never receive this object. */
export function readConnectorAuthorizationCompletion(home: string, id: string) {
  const value = readStored(home, id);
  return value?.protocol && value.completion ? { state: value.protocol.state, completion: value.completion } : undefined;
}
export function clearConnectorAuthorizationPresentation(home: string, id: string, retainInstallation = false) {
  const value = readStored(home, id), protocol = value?.protocol;
  if (protocol) {
    withConnectorProtocols(home, store => store.discard(protocol.state));
    runWithMolisWorkHome(home, () => {
      if (protocol.service === "notion") cancelNotionOAuthFlow(protocol.state);
    });
  }
  if (retainInstallation && value?.installation_id && value.installation_ready) {
    runWithMolisWorkHome(home, () => createFileSecretStore().put(reference(id), JSON.stringify({ installation_id: value.installation_id, installation_ready: true })));
    return undefined;
  }
  const cleanup = cleanupConnectorInstallation(home, value?.installation_id);
  runWithMolisWorkHome(home, () => createFileSecretStore().delete(reference(id)));
  return cleanup;
}
