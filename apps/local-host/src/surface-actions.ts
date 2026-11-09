import { ActionError, bindActionClient, bindActionHandler, requireSynchronous, type ActionClient, type ActionExecutionContext, type ActionProviderRegistration, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONTEXT_RELATION_TYPES } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { PLUGIN_ATTENTION_READ_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-attention";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import { surfaceCompositionActions, SURFACES_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { createSurfaceCorrections, SurfaceCompositionService, type SurfaceComposePorts, type SurfaceCorrectPorts, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";
import type { HomePluginHost } from "./home-plugins.js";
import { hostLog } from "./host-log.js";
import { runningInstalledPluginPlatform } from "./installed-plugin-host.js";
import type { PlacementHost } from "./placement-actions.js";
import { installedPluginEntries } from "./plugin-installation-directory.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { runningProjectPlatform } from "./project-plugins.js";

interface SurfaceHostPorts {
  store: LocalProjectDatabase;
  projectId: string;
  client: ActionClient;
  home(): HomePluginHost | undefined;
  placement(): PlacementHost | undefined;
  now(): Date;
}

const exact = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });

function surfacePlugin(record: PluginInstanceRecord, scope: SurfacePlugin["scope"], manifest: PluginManifest | undefined, slots: readonly UiSlotDescriptor[]): SurfacePlugin {
  return { plugin_id: record.plugin_id, install_id: record.install_id, scope,
    revision: JSON.stringify([record.version, record.manifest_digest, record.installation_generation]),
    enabled: record.state === "running", presentation: manifest?.presentation, slots };
}

/** Read the installed records and their owners' running contributions; neither lookup opens or starts a platform. */
async function surfacePlugins(ports: SurfaceHostPorts, current: () => void): Promise<readonly SurfacePlugin[]> {
  const { store, projectId } = ports;
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
  const { projectId, store, client } = ports;
  const service = new SurfaceCompositionService();
  const attention = new AttentionModule(store.db, { exists: () => true });
  const forCall = (caller: ActionExecutionContext, readsAttention = false): SurfaceComposePorts & SurfaceCorrectPorts => {
    const needsAttention = readsAttention && caller.audience === "plugin";
    const current = () => {
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "调用上下文与项目不一致");
      if (!store.db.open) throw new ActionError("actions.host_closed", "项目运行环境已关闭");
      caller.signal?.throwIfAborted();
      if (needsAttention && !caller.permissions.includes(PLUGIN_ATTENTION_READ_PERMISSION)) {
        throw new ActionError("actions.forbidden", "插件没有读取等你条目的权限");
      }
      requireSynchronous(caller.assert_authority_current?.(undefined, needsAttention ? [PLUGIN_ATTENTION_READ_PERMISSION] : undefined));
    };
    const valuesClient = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
    return {
      caller, current, beforeEffect: caller.beforeEffect, signal: caller.signal,
      catalog: () => surfacePlugins(ports, current),
      discover: () => client.discover(caller),
      retain: views => {
        if (!caller.retainAuthority) throw new ActionError("actions.host_context_missing", "组合需要原调用的授权");
        return caller.retainAuthority(views.map(exact)).assertCurrent;
      },
      values: (view, input, signal) => valuesClient.invoke<PresentationValuesInput, PresentationValues>({ ...view, ...exact(view) }, input, { ...caller, signal }),
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
      bindActionHandler(surfaceCompositionActions.compose, (input, caller) => service.compose(input, forCall(caller, input.slot.kind === "attention"))),
      bindActionHandler(surfaceCompositionActions.correct, (input, caller) => service.correct(input, forCall(caller))),
    ],
  };
}
