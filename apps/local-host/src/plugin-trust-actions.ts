import type { ActionDefinition, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { installPackageInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions, pluginInstallHandlers } from "./plugin-install-actions.js";
import { PluginInstallService } from "./plugin-install-service.js";

/** The Host's own provider of installing a plugin from a signed package; it grants nothing to a plugin. */
export function pluginInstallProvider(service: PluginInstallService): ActionProviderRegistration {
  return { provider: { provider_id: PLUGIN_INSTALL_PROVIDER_ID, title: "插件的安装", kind: "system" },
    definitions: Object.values(pluginInstallActions) as ActionDefinition[], handlers: pluginInstallHandlers(service) };
}

/** The install provider over the Home: its ledger, its kept packages, and the project the plugin is installed in. */
export function pluginInstallProviderFor(home: string, source: ProjectPluginHost): ActionProviderRegistration {
  return pluginInstallProvider(new PluginInstallService({ ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home),
    install: (projectId, release) => installPackageInProject(source, projectId, release) }));
}
