/**
 * Installed agent-built plugins. Plugin Runtime owns identity, versions, upgrade, rollback, crash isolation and
 * uninstall; this definition only proxies to the plugin's sandboxed process. The plugin's code never runs in the
 * host process, and its interface is the host's component renderer, so no plugin script runs in the page either.
 */
import { pluginErrors, type PluginAppContribution, type PluginDefinition, type PluginManifest, type PluginStartContext, type PluginRouteBinding, type PluginUpgradeContext } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { trustedDecisionSubmitted } from '@molis-ai/molis-work-kernel';
import { assertCapturedPluginActionCurrent, currentPluginAction, inPluginInstance, pluginManifestDigest } from '@molis-ai/molis-work-plugin-runtime';
import { exposedActionReference } from './installed-plugin-exposed-actions.js';
import { rememberInstalledActionSource } from './installed-action-registration.js';
import { isSandboxSourceOperation, type SandboxEffects, type SandboxIdentity, type SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { createSandboxRunner, createBackgroundLane, readOnlySandboxStorage, SANDBOX_BACKGROUND_LIMITS, sandboxServicesFor, SandboxError, type SandboxBackgroundLane, type SandboxRunner, type SandboxServices, type SandboxServiceContext } from '@molis-ai/molis-work-plugin-sandbox';
import { executionProjectReach } from './plugin-project-reach-subject.js';
import { resolvePluginComponentCall, validatePluginPresentation } from '@molis-ai/molis-work-design-system';
import { actionErrorFromResponse, sandboxUpgradeOperation, actionErrorResponse, isRecord, sandboxUiDeclaration, sandboxOperationEffects } from '@molis-ai/molis-work-plugin-sdk';
import { installedStageFrame } from './installed-stage-section.js';
import { releaseInstructions } from './installed-plugin-prompts.js';
import type { InstalledRelease } from './installed-release.js';
import { activeLocale } from './web-locale.js';
import { sandboxTextPacks } from './ui-text-provider.js';
import { capabilityLimits, capabilityPolicyBinding, latestCapability, slowOperations, type Lane, type CapabilityExecution } from './installed-plugin-capabilities.js';
import { assertOperationGranted, grantedEffects, projectInstalledPermissions } from './installed-permission-projection.js';

/** A sandbox error after which the process is not used again: the next call starts a new one. */
export const GONE = new Set(['sandbox.process_exit', 'sandbox.stopped', 'sandbox.cancelled', 'sandbox.start_failed', 'sandbox.start_timeout', 'sandbox.operation_timeout', 'sandbox.memory_limit', 'sandbox.cpu_limit', 'sandbox.channel_limit', 'sandbox.channel_error', 'sandbox.protocol_error']);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** Only the Host's Node preflight may surface its recovery instructions through Plugin Runtime. */
export function rethrowInstalledSandboxStartup(error: unknown): never {
  if (error instanceof SandboxError && error.code === 'sandbox.node_runtime_unavailable') {
    throw pluginErrors.executor_failed(error.message);
  }
  throw error;
}

/** The Runtime bridge reaches the runner from the original exposed action. HTTP route control alone carries no such authority. */
function installedOperation(release: InstalledRelease, context: PluginStartContext, operation: unknown) {
  const scope = currentPluginAction(), called = scope?.caller.current_action;
  if (typeof operation !== 'string' || !scope || !inPluginInstance(scope, context) || scope.definition.action.local_id !== operation)
    throw new ActionError('actions.forbidden', '已安装插件的写入须经原页面或动作网关');
  const expected = exposedActionReference(release, operation);
  if (called?.capability_id !== expected.capability_id || called.version !== expected.version || called.provider_id !== expected.provider_id
    || scope.definition.action.scope !== (context.project_id == null ? 'home' : 'project'))
    throw new ActionError('actions.forbidden', '这次操作不属于原已安装动作');
  assertCapturedPluginActionCurrent(scope, context);
  return operation;
}

/** What the Host lends a sandboxed plugin's definition. */
export interface SandboxedPluginHost {
  source?(release: InstalledRelease, context: PluginStartContext, live: () => void, call: import('./sandbox-integration.js').SandboxIntegrationProxyInput['call']): NonNullable<PluginAppContribution['home_source']>;
  capability?: SandboxServices['capability']; network?: SandboxServices['network']; capabilities?(context: SandboxServiceContext): Promise<readonly CapabilityExecution[]>;
  backgroundLocale?(): string;
  /** Throws when the installation (or the publisher behind it) is no longer one that may act; asked before every effect of every service, storage included. */
  assertLive?(identity: Readonly<SandboxIdentity>): void;
  grantedCapabilities?(identity: Readonly<SandboxIdentity>): readonly string[];
}

function packageAgentBodies(release: InstalledRelease): Pick<PluginDefinition, "agent_prompt_names" | "agent_prompts" | "methods"> {
  const packaged = release.packaged, bodies = packaged?.agentBodies;
  if (!bodies) return {};
  const roles = bodies.filter(item => item.kind === 'role');
  return {
    agent_prompt_names: Object.fromEntries(roles.map(item => [item.prompt_id!, { title: item.name, purpose: item.purpose }])),
    agent_prompts: roles.map(item => ({ prompt_id: item.prompt_id!, version: /* @version format.sandbox.agent-prompt */ 1, layer: 'role', body: item.body })),
    methods: packaged!.manifest.methods?.map(({ body: _path, ...declared }) => ({
      ...declared, body: bodies.find(item => item.kind === 'method' && item.entry_id === declared.skill_id)?.body ?? '',
    })) ?? [],
  };
}

/** The candidate sees one read-only broker on the original installation, before the SQL worker is called. */
function installedUpgradeValidator(release: InstalledRelease, manifest: PluginManifest, localePacks: ReturnType<typeof sandboxTextPacks>) {
  const id = sandboxUpgradeOperation(manifest), sources = manifest.upgrade_compatibility?.migratable_from_versions;
  if (!id || !sources) return undefined;
  const operation = release.design.contract.operations.find(item => item.id === id)!;
  return async ({ from, context }: { from: { version: string }; context: PluginUpgradeContext }) => {
    if (!sources.includes(from.version)) return;
    context.assertCurrent?.();
    assertSandboxActivationScope(context.project_id, release.permissions);
    const storage = context.services?.storage, authority = context.assertCurrent;
    let accepted: SandboxJson | undefined;
    try {
      const validator = await createSandboxRunner({
        bundlePath: release.bundlePath, bundleSha256: release.packaged?.entrypointSha256, contract: release.design.contract, grants: operation.effects,
        identity: { projectId: context.project_id ?? null, installationId: context.install_id, pluginId: manifest.plugin_id, namespace: 'installed' },
        services: storage ? { storage: readOnlySandboxStorage({ get: key => { authority?.(); return storage.get(key); } }) } : {}, localePacks,
      });
      try { accepted = await validator.call(id, from.version, { beforeEffect: async () => authority?.() }); }
      finally { await validator.stop(); }
    } catch {
      authority?.();
      throw pluginErrors.upgrade_validation_failed('插件的只读迁移校验未完成');
    }
    authority?.();
    if (accepted !== true) throw pluginErrors.upgrade_validation_failed('插件拒绝迁移当前安装的数据');
  };
}

/** Model selection and image connections belong to the person's Home (BL-491). Dual-instance project halves strip Home-only effects instead of failing activation. */
function assertSandboxActivationScope(projectId: string | null | undefined, approved: SandboxEffects, dualInstance = false): void {
  if (projectId && !dualInstance && (approved.modelSettings?.length || approved.imageGeneration?.length))
    throw pluginErrors.declaration_invalid('模型设置和图片生成只给装在 Home 里的插件，项目里的实例不提供');
}

function effectsForHalf(effects: SandboxEffects, projectId: string | null | undefined, dualInstance: boolean): SandboxEffects {
  if (!dualInstance) return effects;
  if (projectId) {
    const { homeDatabase: _h, modelSettings: _m, imageGeneration: _i, ...projectEffects } = effects;
    return projectEffects;
  }
  const { projectDatabase: _p, artifacts: _a, ...homeEffects } = effects;
  return homeEffects;
}

/** `host.capability` serves the platform capabilities the person approved; the broker still checks each call against them. */
export function sandboxedPluginDefinition(release: InstalledRelease, approved: SandboxEffects,
  /** What the installed package declared, already checked against `sandboxPluginManifest`. */
  declared: PluginManifest, host: SandboxedPluginHost = {}): PluginDefinition {
  if (release.design.presentation !== undefined) validatePluginPresentation(release.design.presentation, release.design.parts, release.design.contract);
  const manifest = declared;
  const descriptor = sandboxUiDeclaration({ pluginId: release.pluginId, name: manifest.name, ui: release.design.ui });
  const manifestDigest = pluginManifestDigest(manifest);
  const words = release.packaged?.localePacks ?? null;
  const localePacks = sandboxTextPacks(words);
  const instructions = manifest.kind === 'app' ? releaseInstructions(release, [release]) : undefined;
  // A model call runs in its own process, so the plugin's other reads and saves never wait behind it.
  const lanes = new Map<Lane, Promise<SandboxRunner>>(); let background: SandboxBackgroundLane | undefined;
  const upgradeValidator = installedUpgradeValidator(release, manifest, localePacks);
  const upgradeOperation = sandboxUpgradeOperation(manifest);
  const definition: PluginDefinition = { manifest, ...(instructions ? { instructions } : {}), ...packageAgentBodies(release),
    ...(upgradeValidator ? { validateUpgrade: upgradeValidator } : {}),
    execution: 'sandbox',
    async start(context) {
      context.requireGrant('storage:private');
      const dualInstance = manifest.runtime?.scope === 'home' && manifest.runtime.dual_instance === true;
      assertSandboxActivationScope(context.project_id, approved, dualInstance);
      // What the Host built for this activation goes to the sandbox through the broker, which still checks each call against the grants.
      const identity: SandboxIdentity = { projectId: context.project_id ?? null, installationId: context.install_id, pluginId: release.pluginId, namespace: 'installed' };
      // S-48 (PEQ-06): a dual-instance project half's optional grants are bounded live by its Home half's grants and running state.
      const liveGrants = () => dualInstance && context.project_id !== null
        ? context.grants.filter(permission => { try { context.requireGrant(permission); return true; } catch { return false; } })
        : context.grants;
      // The approval as this activation may use it (BL-701): an effect whose switch is off never reaches the broker.
      const owesSource = Boolean(release.design.contract.home_source) && context.project_id == null;
      if (owesSource && !host.source) throw pluginErrors.home_scope_unavailable('个人来源需要 Home 的连接服务');
      const allowed = effectsForHalf(grantedEffects(approved, liveGrants()), context.project_id, dualInstance);
      const backgroundServices = sandboxServicesFor(context.services, instructions ? { ...host, instructions } : host);
      background = createBackgroundLane({ contract: release.design.contract, create: () => createSandboxRunner({ bundlePath: release.bundlePath, bundleSha256: release.packaged?.entrypointSha256,
        contract: release.design.contract, grants: allowed, identity, services: backgroundServices, limits: SANDBOX_BACKGROUND_LIMITS, localePacks }) });
      const lane = background;
      const guardedBackground: SandboxBackgroundLane = { check: lane.check, stop: lane.stop, async run(operationId, input, control) {
        const operation = release.design.contract.operations.find(item => item.id === operationId)!;
        const effects = sandboxOperationEffects(release.design.contract, operation);
        host.assertLive?.(identity);
        assertOperationGranted(effects, liveGrants());
        const callContext: SandboxServiceContext = { identity, operationId, signal: control.signal ?? new AbortController().signal, projectReach: control.projectReach };
        await control.beforeEffect?.(); control.signal?.throwIfAborted(); host.assertLive?.(identity); assertOperationGranted(effects, liveGrants());
        const binding = capabilityPolicyBinding(effects, effects.capabilities?.length ? await host.capabilities?.(callContext) ?? [] : []);
        const beforeEffect = async () => {
          await control.beforeEffect?.(); control.signal?.throwIfAborted(); host.assertLive?.(identity); assertOperationGranted(effects, liveGrants());
          if (effects.capabilities?.length && host.capabilities && capabilityPolicyBinding(effects, await host.capabilities(callContext)) !== binding) {
            throw new SandboxError('plugin.capability_changed', '后台依赖的提供方、版本或执行策略已变化；请核对已发生的结果');
          }
          await control.beforeEffect?.(); control.signal?.throwIfAborted(); host.assertLive?.(identity); assertOperationGranted(effects, liveGrants());
        };
        await beforeEffect();
        return lane.run(operationId, input, { ...control, beforeEffect, locale: host.backgroundLocale?.() });
      } };
      const services = sandboxServicesFor(context.services, { ...host, ...(instructions ? { instructions } : {}), backgroundLane: guardedBackground });
      const open = (lane: Lane) => {
        const existing = lanes.get(lane); if (existing) return existing;
        const created = createSandboxRunner({ bundlePath: release.bundlePath, bundleSha256: release.packaged?.entrypointSha256, contract: release.design.contract, grants: allowed, services,
          identity, localePacks });
        lanes.set(lane, created); created.catch(() => { if (lanes.get(lane) === created) lanes.delete(lane); });
        return created;
      };
      // A bundle that cannot start fails the installation, not the person's first click.
      await open('quick').catch(rethrowInstalledSandboxStartup);
      const contribution: PluginAppContribution = { kind: 'app',
        routes: [sandboxedPluginCall({ release, context, host, identity, lanes, open, upgradeOperation, liveGrants })],
        views: [{ descriptor, render: () => installedStageFrame({ pluginId: release.pluginId, label: manifest.name,
          prefix: context.project_id ? '/projects/' + encodeURIComponent(context.project_id) : '',
          installation: { scope: context.project_id ? 'project' : 'home', install_id: context.install_id,
            installation_generation: context.installation_generation, version: manifest.version, manifest_digest: manifestDigest } }) }],
      };
      if (owesSource && host.source) {
        const live = () => { context.requireGrant('storage:private'); host.assertLive?.(identity); };
        contribution.home_source = host.source(release, context, live, async (id, input, control) => {
          const beforeEffect = async () => { await control.beforeEffect?.(); control.signal?.throwIfAborted(); live(); };
          await beforeEffect();
          const pending = open('quick');
          try {
            const runner = await pending;
            await beforeEffect();
            return await runner.call(id, input, { ...control, beforeEffect, locale: activeLocale() ?? host.backgroundLocale?.() });
          } catch (error) {
            if (GONE.has((error as { code?: string }).code ?? '') && lanes.get('quick') === pending) lanes.delete('quick');
            throw error;
          }
        });
      }
      if (manifest.actions) contribution.actions = manifest.actions.filter(action => !dualInstance || action.action.scope === (context.project_id == null ? 'home' : 'project')).map(action => ({ capability_id: action.capability_id, version: action.version,
        handle: async (caller, input) => {
          const response = await contribution.routes![0]!.handle({ method: 'POST', pathname: '/call', params: {}, query: {}, actor_id: caller.actor_id,
            execution: { signal: caller.signal, beforeEffect: caller.beforeEffect, page_context: caller.page_context, locale: caller.locale,
              assert_authority_current: caller.assert_authority_current, retainBackgroundAuthority: caller.retainBackgroundAuthority }, body: { operation: action.action.local_id, input } });
          const body = response.body as { value?: unknown; error?: unknown; outcome?: string } | undefined;
          if (response.status !== 200) {
            if (body?.outcome === 'unknown') throw new ActionError('actions.outcome_unknown', String(body.error));
            if (action.action.requires_trusted_decision === true || action.action.placement_relation !== undefined || action.action.input_type !== undefined) {
              throw actionErrorFromResponse(response.status, body);
            }
            throw new Error(String(body?.error ?? '插件操作未完成'));
          }
          return body?.value;
        } }));
      return contribution;
    },
    async stop() { const current = [...lanes.values()], lane = background; lanes.clear(); background = undefined;
      await Promise.all([lane?.stop(), ...current.map(item => item.then(runner => runner.stop(), () => undefined))]); },
  };
  rememberInstalledActionSource(definition, release, host.grantedCapabilities, words);
  projectInstalledPermissions(definition, release);
  return definition;
}

/** Execute the original registered action in the correct sandbox lane, preserving its host refusal or uncertain outcome. */
function sandboxedPluginCall({ release, context, host, identity, lanes, open, upgradeOperation, liveGrants }: {
  release: InstalledRelease;
  context: PluginStartContext;
  host: SandboxedPluginHost;
  identity: SandboxIdentity;
  lanes: Map<Lane, Promise<SandboxRunner>>;
  open(lane: Lane): Promise<SandboxRunner>;
  upgradeOperation?: string;
  liveGrants(): readonly string[];
}): PluginRouteBinding {
  return { route_id: 'studio.call', async handle(request) {
    let outcomeUnknown = false, refused: unknown;
    try {
      const body = isRecord(request.body) ? request.body : {}, raw = Object.hasOwn(body, 'operation');
      if (body.binding === 'submit' || raw && (!request.execution || Object.keys(body).some(key => key !== 'operation' && key !== 'input')))
        throw new ActionError('actions.forbidden', '已安装组件的提交须经原页面动作网关');
      const node = raw ? undefined : release.nodes.find(item => item.id === body.componentId);
      if (!raw && (!node || body.binding !== 'read')) throw new Error('未知的组件读取');
      const call = raw ? { operationId: installedOperation(release, context, body.operation), input: Object.hasOwn(body, 'input') ? body.input : {} }
        : resolvePluginComponentCall(node!, 'read', body.payload ?? {});
      await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted();
      const operation = release.design.contract.operations.find(item => item.id === call.operationId && item.id !== upgradeOperation && !(release.design.contract.home_source && isSandboxSourceOperation(item.id)));
      if (!operation) throw new ActionError('actions.forbidden', '这个操作不在已安装页面的合同内');
      const effects = sandboxOperationEffects(release.design.contract, operation), dependencies = effects.capabilities ?? [];
      // Before any of its code runs, whichever door it came through (BL-701, S-48).
      try { host.assertLive?.(identity); assertOperationGranted(effects, liveGrants()); } catch (error) { refused = error; throw error; }
      const projectReach = executionProjectReach(request.execution);
      const callContext: SandboxServiceContext = { identity, operationId: call.operationId, signal: request.execution?.signal ?? new AbortController().signal, projectReach };
      const capabilities = dependencies.length ? await host.capabilities?.(callContext) ?? [] : [];
      if (host.capabilities) for (const id of dependencies) {
        const entry = latestCapability(capabilities, id);
        if (!entry || entry.installed === false) throw new SandboxError('plugin.capability_unavailable', '这项功能依赖的能力当前不可用：' + id);
        if (operation.kind === 'query' && (entry.execution?.cost === 'metered' || entry.effect && entry.effect !== 'read')) {
          throw new SandboxError('plugin.capability_denied', '查询不能自动调用收费或写入能力，请改为手动运行：' + id);
        }
      }
      const binding = capabilityPolicyBinding(effects, capabilities); let policyChanged = false;
      const beforeEffect = async () => {
        await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted(); host.assertLive?.(identity);
        assertOperationGranted(effects, liveGrants());
        if (!host.capabilities || !dependencies.length) return;
        if (capabilityPolicyBinding(effects, await host.capabilities(callContext)) !== binding) {
          policyChanged = true;
          throw new SandboxError('plugin.capability_changed', '依赖能力的提供方、版本或执行策略已变更，本次调用已停止；请检查结果后再决定是否重试');
        }
        await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted(); host.assertLive?.(identity);
        assertOperationGranted(effects, liveGrants());
      };
      await beforeEffect();
      // The owner's review query must stay runnable while its protected command waits at the final check.
      const lane: Lane = operation.trusted_review ? 'review' : slowOperations({ operations: [operation] }, capabilities).has(call.operationId) ? 'slow' : 'quick';
      const pending = open(lane), active = await pending;
      try { return { status: 200, body: { value: await active.call(call.operationId, call.input as SandboxJson, {
        signal: request.execution?.signal, beforeEffect, assert_authority_current: request.execution?.assert_authority_current,
        limits: capabilityLimits(operation.effects, capabilities), projectReach,
        locale: request.execution?.locale ?? activeLocale() ?? host.backgroundLocale?.(),
      }) } }; }
      catch (error) {
        // The worker may wrap a refused SDK call as sandbox.plugin_error; keep the trusted Host's reason.
        let failure = error;
        try { await beforeEffect(); } catch (current) { failure = current; }
        const gone = GONE.has((error as { code?: string }).code ?? '');
        if (gone && lanes.get(lane) === pending) lanes.delete(lane);
        const original = currentPluginAction();
        if (operation.trusted_review && original && !trustedDecisionSubmitted(original.caller) && failure instanceof ActionError) throw failure;
        if (policyChanged || error instanceof SandboxError && error.outcome === 'unknown') { outcomeUnknown = true; throw failure; }
        // A dead process restarts on the next call; the failed call itself is not replayed, so nothing is written twice.
        // When the Host's recheck refused, that refusal is why the runner retired the process (S-87): it stays the answer.
        if (gone) { outcomeUnknown = true; throw failure !== error ? failure : new Error('本次插件调用已停止，结果可能尚未确认；请先检查结果，再决定是否重新执行'); }
        throw failure;
      }
    } catch (error) { // Only a switched-off effect (BL-701), refused before its code ran, is answered as the refusal itself.
      if (error === refused) throw error;
      if (error instanceof ActionError && !outcomeUnknown) return actionErrorResponse(error);
      if (error instanceof SandboxError && !outcomeUnknown && (error.code === 'actions.missing' || error.code === 'actions.conflict' || error.code === 'actions.input_invalid')) {
        return actionErrorResponse(new ActionError(error.code, error.message));
      }
      return { status: 400, body: { error: message(error), ...(outcomeUnknown ? { outcome: 'unknown' } : {}) } };
    }
  } };
}
