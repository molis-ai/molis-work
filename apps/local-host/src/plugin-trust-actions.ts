import type { ActionDefinition, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { controlHomePackage, controlPackageInProject, installPackageInHome, installedHomePlugins, installedPluginsInProject, installPackageInProject, regrantHomePlugin, regrantPluginInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions, pluginInstallActions, pluginInstallHandlers } from "./plugin-install-actions.js";
import { PluginInstallService } from "./plugin-install-service.js";

/** The Host's own provider of installing a plugin from a signed package; it grants nothing to a plugin. */
export function pluginInstallProvider(service: PluginInstallService): ActionProviderRegistration {
  return { provider: { provider_id: PLUGIN_INSTALL_PROVIDER_ID, title: "插件的安装", kind: "system" },
    definitions: [...Object.values(pluginInstallActions), ...Object.values(pluginControlActions)] as ActionDefinition[], handlers: pluginInstallHandlers(service) };
}

/** The install provider over the Home: its ledger, its kept packages, and the project the plugin is installed in. */
export function pluginInstallProviderFor(home: string, source: ProjectPluginHost): ActionProviderRegistration {
  return pluginInstallProvider(new PluginInstallService({ ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home),
    installInProject: (projectId, release) => installPackageInProject(source, projectId, release), installInHome: release => installPackageInHome(source, release),
    assertIntegrationsFree: async manifest => (await homeIntegrationRegistry(home)).assertFree(manifest),
    installed: projectId => installedPluginsInProject(source, projectId),
    control: (projectId, pluginId, action, input) => controlPackageInProject(source, projectId, pluginId, action, input),
    regrant: (projectId, installId, permission, granted) => regrantPluginInProject(source, projectId, installId, permission, granted),
    homeInstalled: () => installedHomePlugins(source.homePlugins()), homeRegrant: (installId, permission, granted) => regrantHomePlugin(source.homePlugins(), installId, permission, granted),
    homeControl: (pluginId, action, input) => controlHomePackage(source.homePlugins(), pluginId, action, input) }));
}
