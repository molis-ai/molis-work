import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { ActionCallContext, ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxEffects, SandboxIdentity } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { ActionService } from '@molis-ai/molis-work-kernel';
import { ArtifactsModule } from '@molis-ai/molis-work-module-artifacts';
import { AgentBuilderStore, type AgentDesign, type AgentRelease, type AgentBuilderPorts } from '@molis-ai/molis-work-plugin-builder';
import { goalsActions } from '@molis-ai/molis-work-plugin-goals';
import { createReminderActionHandlers, REMINDER_ACTIONS, SCHEDULE_REMINDER_PROVIDER_ID, createScheduledOperations, createScheduledOperationActionHandlers,
  SCHEDULE_OPERATION_ACTIONS, SCHEDULE_OPERATION_PROVIDER_ID } from '@molis-ai/molis-work-plugin-schedule';
import { SqlitePluginPrivateStorage, pluginInstallationGeneration } from '@molis-ai/molis-work-plugin-runtime';
import { SandboxError, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { UiHost } from '@molis-ai/molis-work-ui-host';
import type { LocalProjectDatabase } from './project-database.js';
import { createPluginPlatform, type PluginPlatformOptions } from './plugin-platform.js';
import { configuredModelChoices } from './configured-models.js';
import { hostScheduleReminders } from './schedule-reminders.js';
import { scheduleServiceFor } from './schedule-runtime.js';
import { studioStorage } from './plugin-builder/storage.js';
import { installedSignature, releaseVersion, sandboxedPluginDefinition } from './plugin-builder/installed.js';
import { exposeInstalledPlugin, exposedOperationCosts, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import { bindInstalledOperationCaller } from './schedule-operations.js';
import { hostCapabilities, type CapabilityImplementations } from './plugin-builder/capabilities.js';
import { CATALOG_VERSION, capabilityCatalog, catalogCapabilities, registerPlatformCapabilities, type CatalogCapability, type ProjectActions } from './plugin-builder/catalog.js';
import { hostNetwork } from './plugin-builder/network.js';
import { pluginSecrets } from './plugin-builder/secrets.js';
import { createPluginModelGeneration } from './plugin-builder/model.js';

export const INSTALLED_MODEL_KEY = 'plugin-builder:agent-studio:model';
const APPROVED_KEY = 'plugin-builder:agent-studio:approved:';
const SIGNATURE = installedSignature('');

export interface InstalledPluginHostOptions {
  store: LocalProjectDatabase;
  boardId: string;
  homeDirectory: string;
  actorId?: string;
  routePrefix?: string;
  actions?: PluginPlatformOptions['actions'] & Pick<ProjectActions, 'inspect'>;
  capabilities?: PluginPlatformOptions['capabilities'];
  /** Explicit fixture/embed replacement only; production uses the shared Home inference owner. */
  generate?: CapabilityImplementations['generate'];
}

/** One execution owner per project database. Authoring and its Workflow are separate consumers. */
export type InstalledPluginHost = Awaited<ReturnType<typeof openInstalledPlugins>>;
const hosts = new WeakMap<LocalProjectDatabase, Map<string, { home: string; actor: string; project: string; ready: Promise<InstalledPluginHost> }>>();

export function ensureInstalledPlugins(options: InstalledPluginHostOptions): Promise<InstalledPluginHost> {
  const boards = hosts.get(options.store) ?? new Map(); hosts.set(options.store, boards);
  const identity = { home: resolve(options.homeDirectory), actor: options.actorId ?? 'web-user', project: options.actions?.project_id ?? options.boardId };
  const existing = boards.get(options.boardId);
  if (existing) {
    if (existing.home !== identity.home || existing.actor !== identity.actor || existing.project !== identity.project) throw new Error('安装运行入口的 Home、用户或项目身份不一致');
    return existing.ready;
  }
  const ready = openInstalledPlugins(options);
  const entry = { ...identity, ready }; boards.set(options.boardId, entry);
  ready.catch(() => { if (boards.get(options.boardId) === entry) boards.delete(options.boardId); });
  return ready;
}

export async function releaseInstalledPlugins(store: LocalProjectDatabase, boardId: string): Promise<void> {
  const boards = hosts.get(store), entry = boards?.get(boardId);
  if (!entry) return;
  // Keep the owner visible until its processes and registrations are gone.
  try { await (await entry.ready).close(); }
  finally { if (boards?.get(boardId) === entry) boards.delete(boardId); }
}

async function openInstalledPlugins(options: InstalledPluginHostOptions) {
  const { store, boardId, homeDirectory } = options, storage = studioStorage(store.db, boardId), releases = new AgentBuilderStore(storage);
  const actions = options.actions ?? (() => { const service = new ActionService(); return { registry: service, client: service, project_id: boardId }; })();
  const readCatalog = () => capabilityCatalog(actions, options.actorId ?? 'web-user');
  let catalogPending: Promise<CatalogCapability[]> | undefined, exposureRevision = 0;
  const catalog = (): Promise<CatalogCapability[]> => {
    if (catalogPending) return catalogPending;
    catalogPending = (async () => {
      // Re-read after an install/upgrade/withdraw during asynchronous Host inspection.
      let snapshot: CatalogCapability[], revision: number;
      for (;;) {
        revision = exposureRevision; snapshot = await readCatalog();
        if (closed) return [];
        if (revision !== exposureRevision) continue;
        const costs = exposedOperationCosts([...exposed.values()].map(entry => entry.release), snapshot);
        let changed = false;
        for (const [pluginId, entry] of exposed) changed = entry.refresh(costs.get(pluginId)!) || changed;
        if (!changed) return snapshot;
      }
    })().finally(() => { catalogPending = undefined; });
    return catalogPending;
  };
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const platform = createPluginPlatform({ board_id: boardId, actor_id: options.actorId ?? 'web-user', db: store.db, actions, ui: new UiHost(),
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) }),
    privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest),
    capturePrivateData: id => privateStorage.snapshotInstallationData(id),
    restorePrivateData: (id, snapshot) => privateStorage.restoreInstallationData(id, snapshot as ReturnType<typeof privateStorage.snapshotInstallationData>),
    ...(options.capabilities ? { capabilities: options.capabilities } : {}) });
  const records = () => platform.runtime.list().filter(item => item.publisher_signature.startsWith(SIGNATURE) && item.state !== 'uninstalled');
  const recordFor = (pluginId: string) => records().find(item => item.plugin_id === pluginId);
  const releaseFor = (pluginId: string) => {
    const record = recordFor(pluginId);
    return record && releases.versions(record.publisher_signature.slice(SIGNATURE.length)).find(item => releaseVersion(item.version) === record.version);
  };
  const approvedFor = (pluginId: string): SandboxEffects | null => { const raw = storage.get(APPROVED_KEY + pluginId); return raw === null ? null : JSON.parse(raw); };
  const titleOf = (pluginId: string) => releaseFor(pluginId)?.design.title ?? releases.releases().find(item => item.pluginId === pluginId)?.design.title;
  let closed = false;
  const assertInstalled = (identity: Readonly<SandboxIdentity>) => {
    const record = recordFor(identity.pluginId);
    if (closed || identity.namespace !== 'installed' || identity.projectId !== boardId || !record || record.install_id !== identity.installationId || record.state !== 'running') {
      throw new SandboxError('CAPABILITY_DENIED', '插件的安装执行身份已失效');
    }
  };
  const caller = (identity: Readonly<SandboxIdentity>, definition: ActionDefinition, permission: string): ActionCallContext => ({
    actor_id: 'plugin:' + identity.pluginId, actor_kind: 'runtime', project_id: actions.project_id, audience: 'plugin', plugin_install_id: identity.installationId,
    permissions: [permission], allowed_actions: [{ capability_id: definition.capability_id, version: definition.version }] });
  const goals: CapabilityImplementations['goals'] = {
    async list(identity, control) {
      const page = await actions.client.invoke({ ...caller(identity, goalsActions.list, 'goals:read'), signal: control?.signal, validate_authority: () => control?.beforeEffect?.() }, goalsActions.list, { limit: 100 }) as { goals: Array<{ goal_id: string; title: string; work_status: string }> };
      return page.goals.map(goal => ({ id: goal.goal_id, title: goal.title, status: goal.work_status }));
    },
    async note(identity, input, control) {
      const title = titleOf(identity.pluginId);
      const result = await actions.client.invoke({ ...caller(identity, goalsActions.note, 'goals:write'), signal: control?.signal, validate_authority: () => control?.beforeEffect?.(),
        ...(title ? { audit_actor_id: '插件「' + title + '」' } : {}) }, goalsActions.note, { goal_id: input.goalId, body: input.text, idempotency_key: randomUUID() }) as { recorded?: unknown };
      return { recorded: result.recorded === true };
    },
  };
  const capabilityFor = (design: AgentDesign | null | undefined, live: (identity: Readonly<SandboxIdentity>) => boolean): NonNullable<SandboxServices['capability']> => {
    const current = catalogCapabilities({ actions, catalog, live, author: titleOf });
    return design?.catalog === CATALOG_VERSION ? current : hostCapabilities({ goals, current }, live);
  };
  const secrets = pluginSecrets(homeDirectory, boardId, storage);
  const network = hostNetwork({ reach: identity => identity.namespace === 'installed' ? 'all' : 'read', secret: (pluginId, name) => secrets.resolve(pluginId, name) });
  const schedule = scheduleServiceFor(store.db);
  const reminders = hostScheduleReminders({ db: store.db, boardId, projectId: actions.project_id, schedule, routePrefix: options.routePrefix ?? '' });
  const scheduledInstallation = (pluginId: string) => {
    const record = recordFor(pluginId), release = releaseFor(pluginId);
    return record?.state === 'running' && release && approvedFor(pluginId)
      ? { installationId: record.install_id, generation: pluginInstallationGeneration(record), version: record.version, title: release.design.title, operations: release.design.contract.operations } : null;
  };
  const scheduledRuns = createScheduledOperations({ db: store.db, boardId, projectId: actions.project_id, schedule,
    describe: identity => { const current = scheduledInstallation(identity.pluginId); return current?.installationId === identity.installationId ? current : null; },
    link: pluginId => (options.routePrefix ?? '') + '/plugins/' + pluginId });
  const generate = options.generate ?? createPluginModelGeneration({ homeDirectory,
    selection: () => { const raw = storage.get(INSTALLED_MODEL_KEY); return raw ? JSON.parse(raw) : configuredModelChoices(homeDirectory)[0] ?? null; } });
  const disposePlatform = registerPlatformCapabilities(actions, { generate });
  const disposeScheduledOperations = actions.registry.registerProvider({ provider: { provider_id: SCHEDULE_OPERATION_PROVIDER_ID, title: 'Schedule 定时操作', kind: 'system', project_id: actions.project_id },
    definitions: SCHEDULE_OPERATION_ACTIONS, handlers: createScheduledOperationActionHandlers(actions.project_id, scheduledRuns) });
  const disposeReminders = !options.actions ? actions.registry.registerProvider({ provider: { provider_id: SCHEDULE_REMINDER_PROVIDER_ID, title: 'Schedule 提醒', kind: 'system', project_id: actions.project_id },
    definitions: REMINDER_ACTIONS, handlers: createReminderActionHandlers(actions.project_id, reminders) }) : undefined;
  const exposed = new Map<string, InstalledPluginActions>(), recoveryErrors = new Map<string, string>();
  const withdraw = (pluginId: string) => { exposed.get(pluginId)?.dispose(); exposed.delete(pluginId); exposureRevision++; };
  const expose = async (release: AgentRelease) => {
    withdraw(release.pluginId);
    const record = recordFor(release.pluginId)!;
    try {
      exposed.set(release.pluginId, exposeInstalledPlugin(actions, release, async (pluginId, operation, input, context) =>
        await platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: context.actor_id, execution: context, body: { operation, input } })
        ?? { status: 409, body: { error: '这个插件当前没有运行（可能已停用）' } }, () => {
          const current = recordFor(release.pluginId);
          return !closed && current?.install_id === record.install_id && current.version === releaseVersion(release.version) && current.state === 'running'
            ? { available: true } : { available: false, code: 'actions.plugin_unavailable', reason: '插件已停用或版本已变更' };
        }));
      exposureRevision++;
      await catalog();
    } catch (error) {
      recoveryErrors.set(release.pluginId, error instanceof Error ? error.message : String(error));
      platform.supervisor.revoke(release.pluginId); await platform.runtime.stop(record.install_id);
      throw error;
    }
  };
  const definitions = new Map<string, { pluginId: string; value: ReturnType<typeof sandboxedPluginDefinition> }>();
  const definition = (release: AgentRelease, approved: SandboxEffects) => {
    if (!covered(release.permissions, approved)) throw new Error('此版本的安装批准不足，请重新确认权限');
    const key = JSON.stringify([release.pluginId, release.buildId, release.version]), prior = definitions.get(key);
    // Runtime retains immutable implementations across version switches; rollback must reuse the same object.
    if (prior) return prior.value;
    const capability = capabilityFor(release.design, () => true);
    const guard = (context: Parameters<typeof capability.call>[0]) => ({ ...context, beforeEffect: async () => {
      await context.beforeEffect?.(); context.signal.throwIfAborted(); assertInstalled(context.identity);
    } });
    const value = sandboxedPluginDefinition(release, release.permissions, releases.versions(release.buildId).map(item => item.version).filter(version => version < release.version), {
      capabilities: catalog,
      capability: { async call(context, id, input) { const guarded = guard(context); await guarded.beforeEffect(); return capability.call(guarded, id, input); } },
      network: { async request(context, input, authorization) { const guarded = guard(context); await guarded.beforeEffect(); return network.request(guarded, input, authorization); } },
    });
    definitions.set(key, { pluginId: release.pluginId, value });
    return value;
  };
  const covered = (next: SandboxEffects, approved: SandboxEffects) => Object.entries(next).every(([key, values]) => (values as string[]).every(value => ((approved as Record<string, string[]>)[key] ?? []).includes(value)));
  const lifecycle: AgentBuilderPorts['lifecycle'] = async (action, release, grants) => {
    if (closed) throw new Error('安装运行入口已关闭');
    const consent = (grants as { consent?: unknown } | undefined)?.consent === true, record = recordFor(release.pluginId);
    if (action === 'install') {
      if (record) throw new Error('这个插件已经安装，可以直接打开或升级');
      if (!consent) throw new Error('安装前请确认插件要使用的权限');
      const entry = { definition: definition(release, release.permissions), grants: ['storage:private'] };
      // A confirmed reinstall creates a fresh installation fact even if this Supervisor still remembers its revocation.
      platform.runtime.install({ ...entry, deployment: 'local' });
      storage.set(APPROVED_KEY + release.pluginId, JSON.stringify(release.permissions));
      await platform.start([entry]);
      const state = platform.supervisor.state(release.pluginId)?.code === 'plugin_revoked'
        ? await platform.supervisor.enable(release.pluginId) : platform.supervisor.state(release.pluginId);
      if (state?.status !== 'running') { storage.delete(APPROVED_KEY + release.pluginId); throw new Error('安装没有完成：' + (state?.message ?? '插件未能启动')); }
      await expose(release); recoveryErrors.delete(release.pluginId); return;
    }
    if (!record) throw new Error('这个插件还没有安装');
    if (action === 'upgrade' || action === 'rollback') {
      const approved = approvedFor(release.pluginId) ?? {};
      if (!covered(release.permissions, approved) && !consent) throw new Error('这个版本需要新的权限，请确认后再切换');
      const nextApproval = covered(release.permissions, approved) ? approved : release.permissions;
      const next = definition(release, nextApproval);
      const state = action === 'upgrade' ? await platform.upgrade(release.pluginId, next) : await platform.rollback(release.pluginId, next);
      if (state?.status !== 'running') throw new Error((action === 'upgrade' ? '升级' : '回滚') + '没有完成：' + (state?.message ?? '插件未能启动') + '，原版本继续可用');
      storage.set(APPROVED_KEY + release.pluginId, JSON.stringify(nextApproval)); await expose(release); recoveryErrors.delete(release.pluginId); return;
    }
    if (action === 'disable') { withdraw(release.pluginId); platform.supervisor.revoke(release.pluginId); await platform.runtime.stop(record.install_id); return; }
    if (action === 'enable') {
      const approved = approvedFor(release.pluginId);
      if (!approved) throw new Error('找不到此安装的批准记录，请先卸载并重新确认安装');
      if (!platform.supervisor.state(release.pluginId)) await platform.start([{ definition: definition(release, approved), grants: record.grants }]);
      const state = await platform.supervisor.enable(release.pluginId);
      if (state.status !== 'running') throw new Error('启用没有完成：' + (recoveryErrors.get(release.pluginId) ?? state.message ?? ''));
      await expose(release); recoveryErrors.delete(release.pluginId); return;
    }
    if (action === 'uninstall') {
      withdraw(release.pluginId); platform.supervisor.revoke(release.pluginId);
      reminders.cancelInstallation(release.pluginId, record.install_id); scheduledRuns.cancelInstallation(release.pluginId, record.install_id); secrets.remove(release.pluginId);
      const keepData = (grants as { keepData?: unknown } | undefined)?.keepData === true;
      await platform.runtime.uninstall(record.install_id, { retain_private_data: keepData });
      for (const [key, entry] of definitions) if (entry.pluginId === release.pluginId) definitions.delete(key);
      if (!keepData) privateStorage.deleteInstallationData(record.install_id);
      storage.delete(APPROVED_KEY + release.pluginId); recoveryErrors.delete(release.pluginId);
    }
  };
  let stopScheduledRuns: (() => void) | undefined;
  const close = async () => {
    if (closed) return;
    closed = true; stopScheduledRuns?.(); disposePlatform(); disposeScheduledOperations(); disposeReminders?.();
    await platform.events.close();
    for (const id of [...exposed.keys()]) withdraw(id);
    const failures: unknown[] = [];
    for (const pluginId of platform.supervisor.enabledPluginIds()) {
      const state = platform.supervisor.state(pluginId);
      if (state?.status === 'running' && state.install_id) try { await platform.runtime.stop(state.install_id, { preserve_enabled: true }); } catch (error) { failures.push(error); }
      platform.supervisor.revoke(pluginId);
    }
    if (failures.length) throw new AggregateError(failures, '安装插件停止失败');
  };
  try {
    for (const record of records()) {
      try {
        const release = releaseFor(record.plugin_id), approved = approvedFor(record.plugin_id);
        if (!release) throw new Error('找不到已安装版本 ' + record.version + ' 的发布记录');
        if (!approved) throw new Error('找不到此安装的批准记录，请在创作台卸载并保留数据，再重新确认安装');
        if (record.state === 'disabled' || record.state === 'quarantined') continue;
        const report = await platform.start([{ definition: definition(release, approved), grants: record.grants }]);
        if (report.running.includes(record.plugin_id)) await expose(release);
        else throw new Error(report.failed[0]?.message ?? report.blocked[0]?.message ?? '安装插件未能恢复');
      } catch (error) { recoveryErrors.set(record.plugin_id, error instanceof Error ? error.message : String(error)); }
    }
    stopScheduledRuns = bindInstalledOperationCaller(store.db, boardId, { describe: scheduledInstallation, async call(run, control) {
      const response = await platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + run.pluginId + '/call', actor_id: 'scheduled-plugin:' + run.pluginId,
        execution: { signal: control.signal, beforeEffect: async () => control.beforeEffect() }, body: { operation: run.operationId, input: run.input } });
      const body = response?.body as { value?: unknown; error?: unknown; outcome?: string } | undefined;
      return { state: response?.status === 200 ? 'succeeded' : body?.outcome === 'unknown' ? 'unknown' : 'failed',
        value: response?.status === 200 ? body?.value : body?.error ?? recoveryErrors.get(run.pluginId) ?? '这个插件当前没有运行（可能已停用）' };
    } });
    return { platform, storage, actions, releases, catalog, capabilityFor, network, secrets, lifecycle, close, records, releaseFor, recoveryErrors,
      refreshPublicActions: async () => { if (exposed.size) await catalog(); },
      installations: () => records().map(item => ({ pluginId: item.plugin_id, buildId: item.publisher_signature.slice(SIGNATURE.length), version: Number(item.version.split('.')[0]),
        state: recoveryErrors.has(item.plugin_id) ? 'failed' : item.state, effects: approvedFor(item.plugin_id) ?? {}, ...(recoveryErrors.has(item.plugin_id) ? { error: recoveryErrors.get(item.plugin_id) } : {}) })) };
  } catch (error) { await close(); throw error; }
}
