import { ActionError, bindActionClient, bindActionHandler, requireSynchronous, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { PLUGIN_ATTENTION_READ_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-attention";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PresentationOverview, PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { surfaceCompositionActions, SURFACES_PROVIDER_ID, type SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { createSurfaceCorrections, SurfaceCompositionService, type SurfaceComposePorts, type SurfaceCorrectPorts, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";
import type { HomePluginHost } from "./home-plugins.js";
import { hostLog } from "./host-log.js";
import { runningInstalledPluginPlatform } from "./installed-plugin-host.js";
import type { PlacementHost } from "./placement-actions.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { runningProjectPlatform } from "./project-plugins.js";
import { surfaceHomeDirectory, type SurfaceHomeCatalogReader } from "./surface-home-directory.js";
import { surfaceSampleFor, retainSurfaceDirectory } from "./surface-read-sample.js";

interface SurfaceHostPorts {
  store: LocalProjectDatabase;
  reference: LocalHostProjectReference;
  homeDirectory?: string;
  readCatalog: SurfaceHomeCatalogReader;
  client: ActionClient & { discoverRetained(caller: ActionExecutionContext): ReturnType<SurfaceComposePorts["discover"]> };
  home(): HomePluginHost | undefined;
  placement(): PlacementHost | undefined;
  now(): Date;
}

const exact = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

function surfacePlugin(record: PluginInstanceRecord, scope: SurfacePlugin["scope"], manifest: PluginManifest | undefined, slots: readonly UiSlotDescriptor[]): SurfacePlugin {
  return { plugin_id: record.plugin_id, install_id: record.install_id, scope,
    revision: JSON.stringify([record.version, record.manifest_digest, record.installation_generation]),
    state: record.state, presentation: manifest?.presentation, slots };
}

/** Read the installed records and their owners' running contributions; neither lookup opens or starts a platform. */
async function surfacePlugins(ports: SurfaceHostPorts, current: () => void): Promise<readonly SurfacePlugin[]> {
  const { store, reference: { project_id: projectId } } = ports;
  const [project, installed] = await Promise.all([runningProjectPlatform(store, projectId), runningInstalledPluginPlatform(store, projectId)]);
  current();
  const projectEntries = installedPluginEntries(store.db).map(({ record, manifest }) => {
    const platform = [project, installed].find(candidate => candidate?.supervisor.state(record.plugin_id)?.install_id === record.install_id);
    const contribution = platform?.supervisor.contribution(record.plugin_id);
    const slots = contribution?.kind === "app" ? contribution.views?.flatMap(view => view.descriptor.slots) ?? [] : [];
    return surfacePlugin(record, "project", manifest, slots);
  });
  const home = ports.home();
  const homeEntries = home?.installations(true).filter(record => record.state !== "uninstalled")
    .map(record => surfacePlugin(record, "home", home.manifest(record.plugin_id), record.surface_slots ?? [])) ?? [];
  return [...projectEntries, ...homeEntries];
}

export function surfaceActionProvider(ports: SurfaceHostPorts): ActionProviderRegistration {
  const { reference: { project_id: projectId }, store, client } = ports;
  const service = new SurfaceCompositionService();
  const attention = new AttentionModule(store.db, { exists: () => true });
  const forCall = (caller: ActionExecutionContext, slot?: SurfaceSlot["kind"]): SurfaceComposePorts & SurfaceCorrectPorts => {
    const needsAttention = slot === "attention" && caller.audience === "plugin";
    const sample = slot && caller.audience === "user" ? surfaceSampleFor(store, slot) : undefined;
    const current = () => {
      sample?.request?.assertCurrent();
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
      if (!store.db.open) throw new ActionError("actions.host_closed", "项目运行环境已关闭");
      caller.signal?.throwIfAborted();
      if (needsAttention && !caller.permissions.includes(PLUGIN_ATTENTION_READ_PERMISSION)) {
        throw new ActionError("actions.forbidden", "插件没有读取等你条目的权限");
      }
      requireSynchronous(caller.assert_authority_current?.(undefined, needsAttention ? [PLUGIN_ATTENTION_READ_PERMISSION] : undefined));
    };
    const reader = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
    const read = <Input, Output>(view: ActionView, input: Input, signal: AbortSignal, assertCurrent: () => void) =>
      reader.invoke<Input, Output>({ ...view, ...exact(view) }, input, { ...caller, signal, assert_authority_current: assertCurrent });
    const home = ports.homeDirectory && slot === "home" ? homePorts(ports, ports.homeDirectory, sample, read) : undefined;
    return {
      caller, current, beforeEffect: caller.beforeEffect, signal: sample?.request?.signal ?? caller.signal,
      catalog: home?.catalog ?? (() => sample?.catalog.plugins ?? surfacePlugins(ports, current)),
      ...(sample && !home ? { deadline: sample.deadline, retainCatalog: (plugins: readonly SurfacePlugin[]) => retainCatalog(sample.catalog, plugins, sample) } : {}),
      ...(sample?.discussion ? { discussion: sample.discussion } : {}),
      ...(home ? { home: home.ports } : {}),
      discover: async () => retainSurfaceDirectory(await client.discoverRetained(caller), sample),
      values: read<PresentationValuesInput, PresentationValues>,
      corrections: createSurfaceCorrections(store.db, caller), now: () => ports.now().toISOString(),
      attention: () => attention.listSurfaceEntries(projectId),
      relations: candidates => (ports.placement()?.relationsFor(projectId, candidates) ?? []).flatMap(edge => {
        const { source, target, type, revision } = edge;
        if (!source.object_type || !target.object_type || (type !== CONTEXT_RELATION_TYPES.derived_from && type !== CONTEXT_RELATION_TYPES.copied_from)) return [];
        return [{ derived: { kind: source.object_type, id: source.id }, origin: { kind: target.object_type, id: target.id }, type, revision }];
      }),
      diagnostic: (event, details) => hostLog.warn("surfaces", event, undefined, details),
    };
  };
  return {
    provider: { provider_id: SURFACES_PROVIDER_ID, kind: "system", title: "操作面组合", project_id: projectId },
    definitions: Object.values(surfaceCompositionActions),
    handlers: [
      bindActionHandler(surfaceCompositionActions.compose, (input, caller) => service.compose(input, forCall(caller, input.slot.kind))),
      bindActionHandler(surfaceCompositionActions.correct, (input, caller) => service.correct(input, forCall(caller))),
    ],
  };
}

function retainCatalog(original: ReturnType<typeof surfaceHomeDirectory> | undefined, plugins: readonly SurfacePlugin[], sample: ReturnType<typeof surfaceSampleFor>) {
  if (!original || original.plugins.length !== plugins.length || !plugins.every((plugin, index) => original.plugins[index] === plugin))
    throw new ActionError("actions.provider_changed", "没有本次呈现的插件目录");
  if (sample) sample.catalogRetained = true;
  return original.assertCurrent;
}

function homePorts(host: SurfaceHostPorts, homeDirectory: string, sample: ReturnType<typeof surfaceSampleFor>,
  read: (view: ActionView, input: Record<string, never>, signal: AbortSignal, assertCurrent: () => void) => Promise<PresentationOverview>) {
  let catalog: ReturnType<typeof surfaceHomeDirectory> | undefined;
  const ports: NonNullable<SurfaceComposePorts["home"]> = {
    overview: (view, signal, assertCurrent) => read(view, {}, signal, assertCurrent),
    acceptsEmptyInput: view => compileActionSchema(view.action.input_schema)({}) === true,
    hiddenAboveLabel: count => ({ owner: "workbench", key: "workbench.home.hidden-above", args: [{ name: "count", kind: "number", number: count }] }),
    ...(sample ? { formOnly: sample.formOnly } : {}),
    ...(sample?.deadline ? { deadline: sample.deadline } : {}),
    retainCatalog: plugins => retainCatalog(catalog, plugins, sample),
  };
  return { ports, catalog() {
    catalog = sample?.catalog ?? surfaceHomeDirectory({ ...host, homeDirectory, home: host.home() });
    return catalog.plugins;
  } };
}
