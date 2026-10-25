import type { ActionDefinition, ActionProviderRegistration, ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { pluginConsentProvider } from "./installed-plugin-consent-actions.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions, pluginInstallHandlers } from "./plugin-install-actions.js";
import type { PluginInstallService } from "./plugin-install-service.js";

/** The Host's own provider of installing a plugin from a signed package; it grants nothing to a plugin. */
export function pluginInstallProvider(service: PluginInstallService): ActionProviderRegistration {
  return { provider: { provider_id: PLUGIN_INSTALL_PROVIDER_ID, title: "插件的安装", kind: "system" },
    definitions: Object.values(pluginInstallActions) as ActionDefinition[], handlers: pluginInstallHandlers(service) };
}

/** What the person does about a plugin's trust, for the whole of the Host's run: take an agreement back, install a package, see who they trust. */
export function registerPluginTrustActions(registry: ActionRegistryPort, ports: { ledger: PluginConsentLedger; install: PluginInstallService }): () => void {
  const removers: Array<() => void> = [];
  for (const provider of [pluginConsentProvider(ports.ledger), pluginInstallProvider(ports.install)]) removers.push(registry.registerProvider(provider));
  return () => { for (const remove of removers.reverse()) remove(); };
}
