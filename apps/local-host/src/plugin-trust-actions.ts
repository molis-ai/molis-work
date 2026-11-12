import { homeAgentDefinitions } from "./agent-definitions/builtin-registrations.js";
import { homedir } from "node:os";
import { ActionError, bindActionHandler, retainActionAuthority, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { localPackageSignAction, type LocalPackageSignInput, type LocalPackageSignResult } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { skillImportActions } from "@molis-ai/molis-work-contracts/services/skills";
import { completeContentPackagePayload } from "@molis-ai/molis-work-plugin-sdk";
import { parsePluginPackage, signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { pluginKitHeaders, pluginsKitReport } from "./kit-actions.js";
import { pluginPackageExport, pluginPackageExportHandler } from "./plugin-package-export.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { controlHomePackage, controlPackageInProject, installationPresentationCatalog, installPackageInHome, installedHomePlugins, installedPluginsInProject, installPackageInProject, regrantHomePlugin, regrantPluginInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallDefinitions, pluginInstallHandlers, pluginInstallPerson } from "./plugin-install-actions.js";
import { PluginInstallService, assertInstallAuthority } from "./plugin-install-service.js";
import { studioPublisherIdentity, localPublisherKeyId, readSealedLocalPublisherKeyId } from "./plugin-builder/publisher-identity.js";
import { SkillImportService, localSkillScan } from "./skill-import.js";
import { bundledPackagesDirectory } from "./bundled-packages.js";

const LOCAL_PUBLISHER_ID = "molis-home";
const signing = { capability_id: localPackageSignAction.capability_id, version: localPackageSignAction.version, provider_id: PLUGIN_INSTALL_PROVIDER_ID };
const confirmingImport = { capability_id: skillImportActions.confirm.capability_id, version: skillImportActions.confirm.version, provider_id: PLUGIN_INSTALL_PROVIDER_ID };

/** Check the content format and the package wire format before the identity owner touches the Home. */
function preflight(input: LocalPackageSignInput): void {
  // The manifest mirror counts toward both byte limits. Use the same wire length as the actual publisher fingerprint.
  const payload = completeContentPackagePayload(input, { publisher_id: LOCAL_PUBLISHER_ID, signature: "ed25519:sha256:" + "0".repeat(64) });
  parsePluginPackage({ payload, signature: null, publisher_key: null });
}

async function signLocalPackage(home: string, service: PluginInstallService, input: LocalPackageSignInput, caller: ActionExecutionContext): Promise<LocalPackageSignResult> {
  const who = pluginInstallPerson(caller);
  // Check and sign the same input even if a same-process caller retains its original object while authorization is awaited.
  const draft = structuredClone(input);
  preflight(draft);
  const signer = await studioPublisherIdentity(home, { beforeEffect: caller.beforeEffect, assertCurrent: () => assertInstallAuthority(caller) });
  const payload = completeContentPackagePayload(draft, { publisher_id: LOCAL_PUBLISHER_ID, signature: signer.publisher_identity });
  const bundle = signPluginPackage({ payload, signature: null, publisher_key: null }, signer);
  const { preview_id } = await service.preview({ bundle }, who, caller);
  return { preview_id };
}

/** The Host's own provider of installing a plugin from a signed package, and of importing Skills as one; it grants nothing to a plugin. */
export function pluginInstallProvider(service: PluginInstallService, imports?: SkillImportService, home?: string): ActionProviderRegistration {
  const definitions = pluginInstallDefinitions(imports), handlers = pluginInstallHandlers(service, imports);
  if (home) {
    definitions.push(localPackageSignAction);
    handlers.push(bindActionHandler(localPackageSignAction, (input, caller) => signLocalPackage(home, service, input, caller)));
  }
  return { provider: { provider_id: PLUGIN_INSTALL_PROVIDER_ID, title: "插件的安装", kind: "system" }, definitions, handlers };
}

/**
 * Skills import over the Home: Character import's scan of the person's own local Agents, the packages kept here, and this Home's
 * publisher identity, made only when a confirmation signs.
 */
export function skillImportFor(home: string, source: ProjectPluginHost, install: PluginInstallService, userHome = homedir()): SkillImportService {
  const packages = new SandboxPackageStore(home);
  return new SkillImportService({ install,
    publisherKeyId: () => localPublisherKeyId(home),
    readSealedPublisherKeyId: async (input, caller) => {
      preflight(input);
      const signingAuthority = caller.retainAuthority?.([signing]);
      if (!signingAuthority) throw new ActionError("actions.forbidden", "读取封存的发布身份需要本次签名的授权");
      return readSealedLocalPublisherKeyId(home, {
        beforeEffect: async () => { await caller.beforeEffect(); await signingAuthority(); },
        assertCurrent: () => { assertInstallAuthority(caller); signingAuthority.assertCurrent(); },
      });
    },
    retained: (pluginId, keyId) => packages.releases(pluginId, keyId),
    sign: async (input, caller) => {
      const project = source.host.projects().find(row => row.project_id === caller.project_id);
      if (!project) throw new ActionError("actions.scope_mismatch", "需要一个打开的项目");
      const nested = retainActionAuthority(caller, confirmingImport, caller.beforeEffect);
      return await source.host.actionClient(project).invoke(nested, signing, input) as LocalPackageSignResult;
    },
    scan: localSkillScan(userHome),
    installed: async (pluginId, scope, projectId) => {
      const rows = scope === "home" ? await installedHomePlugins(source.homePlugins()) : await installedPluginsInProject(source, projectId);
      const row = rows.find(({ record }) => record.plugin_id === pluginId && record.state !== "uninstalled" && record.publisher_trust === "pinned");
      return row && packages.load(pluginId, row.record.publisher_signature, row.record.version).packaged;
    } });
}

/** The install provider over the Home: its ledger, its kept packages, and the project the plugin is installed in. */
export function pluginInstallProviderFor(home: string, source: ProjectPluginHost): ActionProviderRegistration {
  const service = pluginInstallServiceFor(home, source), provider = pluginInstallProvider(service, skillImportFor(home, source, service), home);
  // The AI kit's pack headers and a content package's export come from the install records and packages this provider owns (§4.6, §4.9).
  return { ...provider, definitions: [...provider.definitions, pluginsKitReport, pluginPackageExport],
    handlers: [...provider.handlers, bindActionHandler(pluginsKitReport, (_input, caller) => pluginKitHeaders(home, source, caller)), pluginPackageExportHandler(home, source)] };
}

function pluginInstallServiceFor(home: string, source: ProjectPluginHost): PluginInstallService {
  return new PluginInstallService({ skillStates: (scope, install) => new Map(homeAgentDefinitions(home).skills.settings(scope).filter(row => row.install_id === install).map(row => [row.skill_id, row.state])), ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home),
    installInProject: (projectId, release, check) => installPackageInProject(source, projectId, release, check), installInHome: (release, check) => installPackageInHome(source, release, check),
    presentationCatalog: projectId => installationPresentationCatalog(source, projectId),
    runHomeInstallation: operation => {
      const host = source.homePlugins();
      if (!host) throw pluginErrors.home_scope_unavailable("这里装不了 Home 插件");
      return host.installationScope.run(operation);
    },
    assertIntegrationsFree: async manifest => (await homeIntegrationRegistry(home)).assertFree(manifest),
    installed: projectId => installedPluginsInProject(source, projectId),
    offers: (projectId, reference) => {
      const project = source.host.projects().find(row => row.project_id === projectId);
      return project !== undefined && source.host.client(project).availability(reference).available;
    },
    control: (projectId, input) => controlPackageInProject(source, projectId, input),
    regrant: (projectId, installId, permission, granted, expected) => regrantPluginInProject(source, projectId, installId, permission, granted, expected),
    homeInstalled: () => installedHomePlugins(source.homePlugins()), homeRegrant: (installId, permission, granted, expected) => regrantHomePlugin(source.homePlugins(), installId, permission, granted, expected),
    homeControl: (pluginId, action, input, caller) => controlHomePackage(source.homePlugins(), pluginId, action, input, caller),
    bundledDirectory: source.options.bundledPluginsDirectory ?? bundledPackagesDirectory() });
}
