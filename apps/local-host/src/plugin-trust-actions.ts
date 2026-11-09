import type { ActionDefinition, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { controlHomePackage, controlPackageInProject, installationPresentationCatalog, installPackageInHome, installedHomePlugins, installedPluginsInProject, installPackageInProject, regrantHomePlugin, regrantPluginInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
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
    installInProject: (projectId, release, check) => installPackageInProject(source, projectId, release, check), installInHome: (release, check) => installPackageInHome(source, release, check),
    presentationCatalog: projectId => installationPresentationCatalog(source, projectId),
    runHomeInstallation: operation => {
      const host = source.homePlugins();
      if (!host) throw pluginErrors.home_scope_unavailable("这里装不了 Home 插件");
      return host.installationScope.run(operation);
    },
    assertIntegrationsFree: async manifest => (await homeIntegrationRegistry(home)).assertFree(manifest),
    installed: projectId => installedPluginsInProject(source, projectId),
    control: (projectId, input) => controlPackageInProject(source, projectId, input),
    regrant: (projectId, installId, permission, granted, expected) => regrantPluginInProject(source, projectId, installId, permission, granted, expected),
    homeInstalled: () => installedHomePlugins(source.homePlugins()), homeRegrant: (installId, permission, granted, expected) => regrantHomePlugin(source.homePlugins(), installId, permission, granted, expected),
    homeControl: (pluginId, action, input, caller) => controlHomePackage(source.homePlugins(), pluginId, action, input, caller) }));
}
