import type { ActionDefinition, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { HomeConsentLedger } from "./home-plugin-store.js";
import type { HomePluginHost } from "./home-plugins.js";
import { installedHomePlugins, installedPluginsInProject, installPackageInProject, regrantHomePlugin, regrantPluginInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions, pluginInstallHandlers } from "./plugin-install-actions.js";
import { PluginInstallService } from "./plugin-install-service.js";

/** The Host's own provider of installing a plugin from a signed package; it grants nothing to a plugin. */
export function pluginInstallProvider(service: PluginInstallService): ActionProviderRegistration {
  return { provider: { provider_id: PLUGIN_INSTALL_PROVIDER_ID, title: "插件的安装", kind: "system" },
    definitions: Object.values(pluginInstallActions) as ActionDefinition[], handlers: pluginInstallHandlers(service) };
}

/** The install provider over the Home: its ledger, its kept packages, and the project the plugin is installed in. */
export function pluginInstallProviderFor(home: string, source: ProjectPluginHost, homePlugins: () => HomePluginHost | undefined): ActionProviderRegistration {
  return pluginInstallProvider(new PluginInstallService({ ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home),
    install: (projectId, release) => installPackageInProject(source, projectId, release), installed: projectId => installedPluginsInProject(source, projectId),
    regrant: (projectId, installId, permission, granted) => regrantPluginInProject(source, projectId, installId, permission, granted),
    homeInstalled: () => installedHomePlugins(homePlugins()), homeRegrant: (installId, permission, granted) => regrantHomePlugin(homePlugins(), installId, permission, granted) }));
}
