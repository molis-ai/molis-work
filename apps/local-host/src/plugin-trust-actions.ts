import { homeAgentDefinitions } from "./agent-definitions/builtin-registrations.js";
import { hostLog } from "./host-log.js";
import { homedir } from "node:os";
import { ActionError, bindActionHandler, retainActionAuthority, type ActionExecutionContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { localPackageSignAction, type LocalPackageSignInput, type LocalPackageSignResult } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { SKILL_AUTHORED_PLUGIN_IDS, skillImportActions } from "@molis-ai/molis-work-contracts/services/skills";
import { completeContentPackagePayload } from "@molis-ai/molis-work-plugin-sdk";
import { parsePluginPackage, signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { pluginKitHeaders, pluginsKitReport } from "./kit-actions.js";
import { pluginPackageExport, pluginPackageExportHandler } from "./plugin-package-export.js";
import { homeIntegrationRegistry } from "./builtin-integrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { currentInstalledPluginHost } from "./installed-plugin-host.js";
import { controlHomePackage, controlPackageInProject, installationPresentationCatalog, installPackageInHome, savedPackageSecrets, installedHomePlugins, installedPluginsInProject, installPackageInProject, regrantHomePlugin, regrantPluginInProject, type ProjectPluginHost } from "./project-plugin-ports.js";
import { disposeWorkTerminalsForPublisher } from "./work-terminal-service.js";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SandboxPackageStore } from "./sandbox-package-store.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallDefinitions, pluginInstallHandlers, pluginInstallPerson } from "./plugin-install-actions.js";
import { PluginInstallService, assertInstallAuthority } from "./plugin-install-service.js";
import { studioPublisherIdentity, localPublisherKeyId, readSealedLocalPublisherKeyId } from "./plugin-builder/publisher-identity.js";
import { SkillImportService, localSkillScan, type SkillImportPorts } from "./skill-import.js";
import { SkillAuthoringService, draftSkill } from "./skill-authoring.js";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { hostTextForCommit, textModelAvailability, type HostCompleteText } from "./host-complete-text.js";
import type { SkillAuthoring } from "./plugin-install-actions.js";
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
export function pluginInstallProvider(service: PluginInstallService, imports?: SkillImportService, home?: string, authoring?: SkillAuthoring): ActionProviderRegistration {
  const definitions = pluginInstallDefinitions(imports, authoring), handlers = pluginInstallHandlers(service, imports, authoring);
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
export function skillImportFor(home: string, source: ProjectPluginHost, install: PluginInstallService, userHome = homedir(),
  /** The project's reference from the catalog: resolving it does not open the project's Runtime. */
  resolveProject?: (projectId: string) => Promise<LocalHostProjectReference | null>): SkillImportService {
  return new SkillImportService({ ...skillPackagePorts(home, source, install, resolveProject), scan: localSkillScan(userHome) });
}

/** What making, signing and installing a package of Skills needs of this Home: shared by importing Skills and by writing one's own. */
function skillPackagePorts(home: string, source: ProjectPluginHost, install: PluginInstallService,
  resolveProject?: (projectId: string) => Promise<LocalHostProjectReference | null>): Omit<SkillImportPorts, "scan"> {
  const packages = new SandboxPackageStore(home);
  return { install,
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
    retainedOf: pluginId => packages.releasesOf(pluginId),
    sign: async (input, caller) => {
      // The project comes from the catalog when the Host has no Runtime for it open: signing a content package is the Home provider's
      // home-scoped act and needs the project's reference, not the project's plugins started (a settings page may be the only thing
      // open in that project). The Runtime list alone made an import fail with 「需要一个打开的项目」 on such a page.
      const open = caller.project_id ? source.host.projects().find(row => row.project_id === caller.project_id) : undefined;
      const project = open ?? (caller.project_id && resolveProject ? await resolveProject(caller.project_id) : null);
      if (!project) throw new ActionError("actions.scope_mismatch", "导入技能需要一个打开的项目");
      // The action that is running signs: confirming an import, or saving or removing a Skill of one's own (same provider).
      const running = caller.current_action;
      const nested = retainActionAuthority(caller, running ? { capability_id: running.capability_id, version: running.version, provider_id: PLUGIN_INSTALL_PROVIDER_ID } : confirmingImport, caller.beforeEffect);
      return await source.host.actionClient(project).invoke(nested, signing, input) as LocalPackageSignResult;
    },
    installed: async (pluginId, scope, projectId) => {
      const rows = scope === "home" ? await installedHomePlugins(source.homePlugins()) : await installedPluginsInProject(source, projectId);
      const row = rows.find(({ record }) => record.plugin_id === pluginId && record.state !== "uninstalled" && record.publisher_trust === "pinned");
      return row && packages.load(pluginId, row.record.publisher_signature, row.record.version).packaged;
    } };
}

/**
 * Writing Skills of one's own over the Home (batch 41): the same package ports as an import, taking the package off through the
 * install service, and the configured text model for a draft (`completion`: the Host's injected one, `null` for none, absent for the
 * person's configured model).
 */
export function skillAuthoringFor(home: string, source: ProjectPluginHost, install: PluginInstallService,
  resolveProject?: (projectId: string) => Promise<LocalHostProjectReference | null>, completion?: HostCompleteText | null): SkillAuthoring {
  const model = () => hostTextForCommit(home, completion);
  return {
    service: new SkillAuthoringService({ ...skillPackagePorts(home, source, install, resolveProject),
      uninstall: async (scope, who, caller) => {
        if (scope === "home") await install.controlHome("uninstall", { plugin_id: SKILL_AUTHORED_PLUGIN_IDS.home, keep_data: false }, caller);
        else await install.control({ action: "uninstall", plugin_id: SKILL_AUTHORED_PLUGIN_IDS.project, keep_data: false }, who, caller);
      },
      installedPublisher: async (scope, projectId) => {
        const rows = scope === "home" ? await installedHomePlugins(source.homePlugins()) : await installedPluginsInProject(source, projectId);
        return rows.find(({ record }) => record.plugin_id === SKILL_AUTHORED_PLUGIN_IDS[scope] && record.state !== "uninstalled" && record.publisher_trust === "pinned")?.record.publisher_signature;
      } }),
    drafts: homeAgentDefinitions(home).skillDrafts,
    draft: (intent, caller) => draftSkill(intent, model(), { signal: caller.signal, beforeDispatch: caller.beforeEffect }, prompt => resolveModelPrompt(home, prompt, "system.skills")),
    draftAvailability: () => textModelAvailability(model, "起草技能"),
  };
}

/** The install provider over the Home: its ledger, its kept packages, and the project the plugin is installed in. */
export function pluginInstallProviderFor(home: string, source: ProjectPluginHost,
  resolveProject?: (projectId: string) => Promise<LocalHostProjectReference | null>, completion?: HostCompleteText | null, systemSkillsDirectory?: string): ActionProviderRegistration {
  const service = pluginInstallServiceFor(home, source);
  const provider = pluginInstallProvider(service, skillImportFor(home, source, service, homedir(), resolveProject), home, skillAuthoringFor(home, source, service, resolveProject, completion));
  // The AI kit's pack headers and a content package's export come from the install records and packages this provider owns (§4.6, §4.9).
  return { ...provider, definitions: [...provider.definitions, pluginsKitReport, pluginPackageExport],
    handlers: [...provider.handlers, bindActionHandler(pluginsKitReport, (_input, caller) => pluginKitHeaders(home, source, caller, systemSkillsDirectory)), pluginPackageExportHandler(home, source)] };
}

function pluginInstallServiceFor(home: string, source: ProjectPluginHost): PluginInstallService {
  return new PluginInstallService({ skillStates: (scope, install) => new Map(homeAgentDefinitions(home).skills.settings(scope).filter(row => row.install_id === install).map(row => [row.skill_id, row.state])), ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home),
    installInProject: (projectId, release, check, complete, choices) => installPackageInProject(source, projectId, release, check, complete, choices),
    installInHome: (release, check, complete, choices) => installPackageInHome(source, release, check, complete, choices),
    savedSecrets: (projectId, pluginId) => savedPackageSecrets(source, projectId, pluginId),
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
    homeInstalled: () => installedHomePlugins(source.homePlugins()), homeRegrant: (installId, permission, granted, expected) => regrantHomePlugin(source.homePlugins(), installId, permission, granted, expected, source),
    homeControl: (pluginId, action, input, caller) => controlHomePackage(source.homePlugins(), pluginId, action, input, caller, source),
    onPublisherRevoked: keyId => {
      disposeWorkTerminalsForPublisher(home, keyId);
      // Stopping what it signed continues after this returns; a failure is logged (the next entry or restart reconciles again), never lost.
      void source.homePlugins()?.reconcilePublishers().catch(error => hostLog.warn("plugin-trust", "publisher_revoke_reconcile_failed", error, { scope: "home" }));
      for (const project of source.host.projects()) {
        void source.host.withExistingRuntime(project, async runtime => {
          await currentInstalledPluginHost(runtime.store, runtime.project_id)?.reconcilePublishers();
        }).catch(error => hostLog.warn("plugin-trust", "publisher_revoke_reconcile_failed", error, { scope: "project", project_id: project.project_id }));
      }
    },
    bundledDirectory: source.options.bundledPluginsDirectory ?? bundledPackagesDirectory(),
    // The official packs ship unsigned until batch 26's publisher key: this Home signs one as it signs an import from this machine.
    localSigner: { keyId: () => localPublisherKeyId(home), sign: async (draft, caller) => {
      const input = structuredClone(draft);
      preflight(input);
      const signer = await studioPublisherIdentity(home, { beforeEffect: caller.beforeEffect, assertCurrent: () => assertInstallAuthority(caller) });
      return signPluginPackage({ payload: completeContentPackagePayload(input, { publisher_id: LOCAL_PUBLISHER_ID, signature: signer.publisher_identity }), signature: null, publisher_key: null }, signer);
    } } });
}
