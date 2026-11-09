import { homedir } from "node:os";
import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { controlHomePackage, controlPackageInProject, installPackageInHome, installedHomePlugins, installedPluginsInProject, installPackageInProject, regrantHomePlugin, regrantPluginInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallDefinitions, pluginInstallHandlers } from "./plugin-install-actions.js";
import { PluginInstallService } from "./plugin-install-service.js";
import { studioPublisherIdentity } from "./plugin-builder/publisher-identity.js";
import { SkillImportService, localSkillScan } from "./skill-import.js";
import { bundledPackagesDirectory } from "./bundled-packages.js";

/** The Host's own provider of installing a plugin from a signed package, and of importing Skills as one; it grants nothing to a plugin. */
export function pluginInstallProvider(service: PluginInstallService, imports?: SkillImportService): ActionProviderRegistration {
  return { provider: { provider_id: PLUGIN_INSTALL_PROVIDER_ID, title: "插件的安装", kind: "system" },
    definitions: pluginInstallDefinitions(imports), handlers: pluginInstallHandlers(service, imports) };
}

/**
 * Skills import over the Home: Character import's scan of the person's own local Agents, the packages kept here, and this Home's
 * publisher identity, made only when a confirmation signs.
 */
export function skillImportFor(home: string, source: ProjectPluginHost, install: PluginInstallService, userHome = homedir()): SkillImportService {
  const packages = new SandboxPackageStore(home);
  return new SkillImportService({ install, signer: () => studioPublisherIdentity(home, { beforeEffect: async () => undefined, assertCurrent: () => undefined }),
    scan: localSkillScan(userHome),
    installed: async (pluginId, scope, projectId) => {
      const rows = scope === "home" ? await installedHomePlugins(source.homePlugins()) : await installedPluginsInProject(source, projectId);
      const row = rows.find(({ record }) => record.plugin_id === pluginId && record.state !== "uninstalled" && record.publisher_trust === "pinned");
      return row && packages.load(pluginId, row.record.publisher_signature, row.record.version).packaged;
    } });
}

/** The install provider over the Home: its ledger, its kept packages, and the project the plugin is installed in. */
export function pluginInstallProviderFor(home: string, source: ProjectPluginHost): ActionProviderRegistration {
  const service = pluginInstallServiceFor(home, source);
  return pluginInstallProvider(service, skillImportFor(home, source, service));
}

function pluginInstallServiceFor(home: string, source: ProjectPluginHost): PluginInstallService {
  return new PluginInstallService({ ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home),
    installInProject: (projectId, release) => installPackageInProject(source, projectId, release), installInHome: release => installPackageInHome(source, release),
    assertIntegrationsFree: async manifest => (await homeIntegrationRegistry(home)).assertFree(manifest),
    installed: projectId => installedPluginsInProject(source, projectId),
    offers: (projectId, reference) => {
      const project = source.host.projects().find(row => row.project_id === projectId);
      return project !== undefined && source.host.client(project).availability(reference).available;
    },
    control: (projectId, pluginId, action, input) => controlPackageInProject(source, projectId, pluginId, action, input),
    regrant: (projectId, installId, permission, granted, expected) => regrantPluginInProject(source, projectId, installId, permission, granted, expected),
    homeInstalled: () => installedHomePlugins(source.homePlugins()), homeRegrant: (installId, permission, granted, expected) => regrantHomePlugin(source.homePlugins(), installId, permission, granted, expected),
    homeControl: (pluginId, action, input) => controlHomePackage(source.homePlugins(), pluginId, action, input),
    bundledDirectory: source.options.bundledPluginsDirectory ?? bundledPackagesDirectory() });
}
