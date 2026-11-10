import { homeAgentDefinitions } from "./agent-definitions/builtin-registrations.js";
import { homedir } from "node:os";
import { bindActionHandler, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginKitHeaders, pluginsKitReport } from "./kit-actions.js";
import { pluginPackageExport, pluginPackageExportHandler } from "./plugin-package-export.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { controlHomePackage, controlPackageInProject, installPackageInHome, installedHomePlugins, installedPluginsInProject, installPackageInProject, regrantHomePlugin, regrantPluginInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallDefinitions, pluginInstallHandlers } from "./plugin-install-actions.js";
import { PluginInstallService } from "./plugin-install-service.js";
import { studioPublisherIdentity, localPublisherKeyId } from "./plugin-builder/publisher-identity.js";
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
  return new SkillImportService({ install, signer: control => studioPublisherIdentity(home, control),
    retained: pluginId => { const keyId = localPublisherKeyId(home); return keyId ? packages.releases(pluginId, keyId) : []; },
    scan: localSkillScan(userHome),
    installed: async (pluginId, scope, projectId) => {
      const rows = scope === "home" ? await installedHomePlugins(source.homePlugins()) : await installedPluginsInProject(source, projectId);
      const row = rows.find(({ record }) => record.plugin_id === pluginId && record.state !== "uninstalled" && record.publisher_trust === "pinned");
      return row && packages.load(pluginId, row.record.publisher_signature, row.record.version).packaged;
    } });
}

/** The install provider over the Home: its ledger, its kept packages, and the project the plugin is installed in. */
export function pluginInstallProviderFor(home: string, source: ProjectPluginHost): ActionProviderRegistration {
  const service = pluginInstallServiceFor(home, source), provider = pluginInstallProvider(service, skillImportFor(home, source, service));
  // The AI kit's pack headers and a content package's export come from the install records and packages this provider owns (§4.6, §4.9).
  return { ...provider, definitions: [...provider.definitions, pluginsKitReport, pluginPackageExport],
    handlers: [...provider.handlers, bindActionHandler(pluginsKitReport, (_input, caller) => pluginKitHeaders(home, source, caller)), pluginPackageExportHandler(home, source)] };
}

function pluginInstallServiceFor(home: string, source: ProjectPluginHost): PluginInstallService {
  return new PluginInstallService({ skillStates: (scope, install) => new Map(homeAgentDefinitions(home).skills.settings(scope).filter(row => row.install_id === install).map(row => [row.skill_id, row.state])), ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home),
    installInProject: (projectId, release, check) => installPackageInProject(source, projectId, release, check), installInHome: (release, check) => installPackageInHome(source, release, check),
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
