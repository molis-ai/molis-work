/**
 * Installed agent-built plugins. Plugin Runtime owns identity, versions, upgrade, rollback, crash isolation and
 * uninstall; this definition only proxies to the plugin's sandboxed process. The plugin's code never runs in the
 * host process, and its interface is the host's component renderer, so no plugin script runs in the page either.
 */
import { pluginErrors, type PluginAppContribution, type PluginDefinition, type PluginManifest, type PluginStartContext } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { assertCapturedPluginActionCurrent, currentPluginAction, inPluginInstance, pluginManifestDigest } from '@molis-ai/molis-work-plugin-runtime';
import { exposedActionReference } from './exposed-actions.js';
import { rememberInstalledActionSource } from '../installed-action-registration.js';
import type { SandboxEffects, SandboxIdentity, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { createSandboxRunner, createBackgroundLane, SANDBOX_BACKGROUND_LIMITS, sandboxServicesFor, SandboxError, type SandboxBackgroundLane, type SandboxRunner, type SandboxServices, type SandboxServiceContext } from '@molis-ai/molis-work-plugin-sandbox';
import { executionProjectReach } from '../plugin-project-reach-subject.js';
import { resolvePluginComponentCall, validatePluginPresentation } from '@molis-ai/molis-work-design-system';
import { actionErrorResponse, effectsFromContract, isRecord, sandboxPluginManifest, sandboxUiDeclaration, sandboxOperationEffects } from '@molis-ai/molis-work-plugin-sdk';
import { installedStageFrame } from '../installed-stage-section.js';
import { releaseInstructions } from './prompts.js';
import { releaseVersion, type InstalledRelease } from '../installed-release.js';
import { capabilityLimits, capabilityPolicyBinding, latestCapability, slowOperations, type Lane, type CapabilityExecution } from './capabilities.js';

/** Stable across versions of one build, so a new version upgrades the same installation and keeps its data. */
export const installedSignature = (buildId: string) => 'agent-built:' + buildId;
/** A sandbox error after which the process is not used again: the next call starts a new one. */
export const GONE = new Set(['sandbox.process_exit', 'sandbox.stopped', 'sandbox.cancelled', 'sandbox.start_failed', 'sandbox.start_timeout', 'sandbox.operation_timeout', 'sandbox.memory_limit', 'sandbox.cpu_limit', 'sandbox.channel_limit', 'sandbox.channel_error', 'sandbox.protocol_error']);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

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

/**
 * What a generated plugin declares to the Host: a release's Manifest, or for a trial of a build that has none yet, the one it
 * would install with at version 0.
 */
export function generatedPluginManifest(release: Pick<InstalledRelease, 'pluginId' | 'version' | 'buildId' | 'design'>, earlierVersions: readonly number[] = []): PluginManifest {
  return sandboxPluginManifest({ pluginId: release.pluginId, version: releaseVersion(release.version), name: release.design.title,
    publisher: { publisher_id: 'molis-studio', signature: installedSignature(release.buildId) }, presentation: !!release.design.presentation, upgradesFrom: earlierVersions.map(releaseVersion), effects: effectsFromContract(release.design.contract),
    contract: release.design.contract, actionIdentity: { buildId: release.buildId, version: release.version } });
}

/** `host.capability` serves the platform capabilities the person approved; the broker still checks each call against them. */
export function sandboxedPluginDefinition(release: InstalledRelease, approved: SandboxEffects, compatibleFrom: readonly number[], host: { capability?: SandboxServices['capability']; network?: SandboxServices['network']; capabilities?(context: SandboxServiceContext): Promise<readonly CapabilityExecution[]>;
    /** Throws when the installation (or the publisher behind it) is no longer one that may act; asked before every effect of every service, storage included. */
    assertLive?(identity: Readonly<SandboxIdentity>): void;
    grantedCapabilities?(identity: Readonly<SandboxIdentity>): readonly string[] } = {},
  /** What an installed package declared (already checked against `sandboxPluginManifest`); a generated plugin's is written from its release. */
  declared?: PluginManifest): PluginDefinition {
  if (release.design.presentation !== undefined) validatePluginPresentation(release.design.presentation, release.design.parts, release.design.contract);
  const manifest = declared ?? generatedPluginManifest(release, compatibleFrom);
  const descriptor = sandboxUiDeclaration({ pluginId: release.pluginId, name: manifest.name, ui: release.design.ui });
  const manifestDigest = pluginManifestDigest(manifest);
  const instructions = declared?.kind === 'app' ? releaseInstructions(release, [release]) : undefined;
  // A model call runs in its own process, so the plugin's other reads and saves never wait behind it.
  const lanes = new Map<Lane, Promise<SandboxRunner>>();
  let background: SandboxBackgroundLane | undefined;
  const definition: PluginDefinition = {
    manifest,
    ...(instructions ? { instructions } : {}),
    ...(release.packaged?.agentBodies ? {
      agent_prompt_names: Object.fromEntries(release.packaged.agentBodies.filter(item => item.kind === 'role').map(item => [item.prompt_id!, { title: item.name, purpose: item.purpose }])),
      agent_prompts: release.packaged.agentBodies.filter(item => item.kind === 'role').map(item => ({ prompt_id: item.prompt_id!, version: /* @version format.sandbox.agent-prompt */ 1, layer: 'role' as const, body: item.body })),
      methods: release.packaged.agentBodies.filter(item => item.kind === 'method').map(item => ({ skill_id: item.entry_id, version: /* @version format.sandbox.agent-method */ 1, name: item.name, summary: item.purpose, tools: [], body: item.body })),
    } : {}),
    // Host provenance: Plugin Runtime then requires explicit grants and rolls back code without rolling back data.
    execution: 'sandbox',
    async start(context) {
      context.requireGrant('storage:private');
      // A package's model settings and image connections belong to the person's Home (BL-491): a project's instance of it is refused, as it is for a Home library.
      if (context.project_id && (approved.modelSettings?.length || approved.imageGeneration?.length)) throw pluginErrors.declaration_invalid('模型设置和图片生成只给装在 Home 里的插件，项目里的实例不提供');
      // What the Host built for this activation goes to the sandbox through the broker, which still checks each call against the grants.
      const identity: SandboxIdentity = { projectId: context.project_id ?? null, installationId: context.install_id, pluginId: release.pluginId, namespace: 'installed' };
      const backgroundServices = sandboxServicesFor(context.services, instructions ? { ...host, instructions } : host);
      background = createBackgroundLane({ contract: release.design.contract, create: () => createSandboxRunner({ bundlePath: release.bundlePath,
        contract: release.design.contract, grants: approved, identity, services: backgroundServices, limits: SANDBOX_BACKGROUND_LIMITS }) });
      const lane = background;
      const guardedBackground: SandboxBackgroundLane = { check: lane.check, stop: lane.stop, async run(operationId, input, control) {
        const operation = release.design.contract.operations.find(item => item.id === operationId)!;
        const effects = sandboxOperationEffects(release.design.contract, operation);
        const callContext: SandboxServiceContext = { identity, operationId, signal: control.signal ?? new AbortController().signal, projectReach: control.projectReach };
        await control.beforeEffect?.(); control.signal?.throwIfAborted(); host.assertLive?.(identity);
        const binding = capabilityPolicyBinding(effects, effects.capabilities?.length ? await host.capabilities?.(callContext) ?? [] : []);
        const beforeEffect = async () => {
          await control.beforeEffect?.(); control.signal?.throwIfAborted(); host.assertLive?.(identity);
          if (effects.capabilities?.length && host.capabilities && capabilityPolicyBinding(effects, await host.capabilities(callContext)) !== binding) {
            throw new SandboxError('plugin_builder.capability_changed', '后台依赖的提供方、版本或执行策略已变化；请核对已发生的结果');
          }
          await control.beforeEffect?.(); control.signal?.throwIfAborted(); host.assertLive?.(identity);
        };
        await beforeEffect();
        return lane.run(operationId, input, { ...control, beforeEffect });
      } };
      const services = sandboxServicesFor(context.services, { ...host, ...(instructions ? { instructions } : {}), backgroundLane: guardedBackground });
      const open = (lane: Lane) => {
        const existing = lanes.get(lane); if (existing) return existing;
        const created = createSandboxRunner({ bundlePath: release.bundlePath, contract: release.design.contract, grants: approved, services,
          identity });
        lanes.set(lane, created);
        created.catch(() => { if (lanes.get(lane) === created) lanes.delete(lane); });
        return created;
      };
      // A bundle that cannot start fails the installation, not the person's first click.
      await open('quick');
      const contribution: PluginAppContribution = {
        kind: 'app',
        routes: [{ route_id: 'studio.call', async handle(request) {
          let outcomeUnknown = false;
          try {
            const body = isRecord(request.body) ? request.body : {};
            const raw = Object.hasOwn(body, 'operation');
            if (body.binding === 'submit' || raw && (!request.execution || Object.keys(body).some(key => key !== 'operation' && key !== 'input')))
              throw new ActionError('actions.forbidden', '已安装组件的提交须经原页面动作网关');
            const node = raw ? undefined : release.nodes.find(item => item.id === body.componentId);
            if (!raw && (!node || body.binding !== 'read')) throw new Error('未知的组件读取');
            const call = raw ? { operationId: installedOperation(release, context, body.operation), input: Object.hasOwn(body, 'input') ? body.input : {} }
              : resolvePluginComponentCall(node!, 'read', body.payload ?? {});
            await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted();
            const operation = release.design.contract.operations.find(item => item.id === call.operationId)!;
            const effects = sandboxOperationEffects(release.design.contract, operation), dependencies = effects.capabilities ?? [];
            const projectReach = executionProjectReach(request.execution);
            const callContext: SandboxServiceContext = { identity, operationId: call.operationId, signal: request.execution?.signal ?? new AbortController().signal, projectReach };
            const capabilities = dependencies.length ? await host.capabilities?.(callContext) ?? [] : [];
            if (host.capabilities) for (const id of dependencies) {
              const entry = latestCapability(capabilities, id);
              if (!entry || entry.installed === false) throw new SandboxError('plugin_builder.capability_unavailable', '这项功能依赖的能力当前不可用：' + id);
              if (operation.kind === 'query' && (entry.execution?.cost === 'metered' || entry.effect && entry.effect !== 'read')) {
                throw new SandboxError('plugin_builder.capability_denied', '查询不能自动调用收费或写入能力，请改为手动运行：' + id);
              }
            }
            const binding = capabilityPolicyBinding(effects, capabilities);
            let policyChanged = false;
            const beforeEffect = async () => {
              await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted(); host.assertLive?.(identity);
              if (!host.capabilities || !dependencies.length) return;
              if (capabilityPolicyBinding(effects, await host.capabilities(callContext)) !== binding) {
                policyChanged = true;
                throw new SandboxError('plugin_builder.capability_changed', '依赖能力的提供方、版本或执行策略已变更，本次调用已停止；请检查结果后再决定是否重试');
              }
              await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted(); host.assertLive?.(identity);
            };
            await beforeEffect();
            const lane: Lane = slowOperations({ operations: [operation] }, capabilities).has(call.operationId) ? 'slow' : 'quick', pending = open(lane), active = await pending;
            try { return { status: 200, body: { value: await active.call(call.operationId, call.input as SandboxJson, {
              signal: request.execution?.signal, beforeEffect, assert_authority_current: request.execution?.assert_authority_current,
              limits: capabilityLimits(operation.effects, capabilities), projectReach,
            }) } }; }
            catch (error) {
              // The worker may wrap a refused SDK call as sandbox.plugin_error; keep the trusted Host's reason.
              let failure = error;
              try { await beforeEffect(); } catch (current) { failure = current; }
              const gone = GONE.has((error as { code?: string }).code ?? '');
              if (gone && lanes.get(lane) === pending) lanes.delete(lane);
              if (policyChanged || error instanceof SandboxError && error.outcome === 'unknown') { outcomeUnknown = true; throw failure; }
              // A dead process restarts on the next call; the failed call itself is not replayed, so nothing is written twice.
              // When the Host's recheck refused, that refusal is why the runner retired the process (S-87): it stays the answer.
              if (gone) { outcomeUnknown = true; throw failure !== error ? failure : new Error('本次插件调用已停止，结果可能尚未确认；请先检查结果，再决定是否重新执行'); }
              throw failure;
            }
          } catch (error) {
            if (error instanceof ActionError && !outcomeUnknown) return actionErrorResponse(error);
            return { status: 400, body: { error: message(error), ...(outcomeUnknown ? { outcome: 'unknown' } : {}) } };
          }
        } }],
        views: [{ descriptor, render: () => installedStageFrame({ pluginId: release.pluginId, label: manifest.name,
          prefix: context.project_id ? '/projects/' + encodeURIComponent(context.project_id) : '',
          installation: { scope: context.project_id ? 'project' : 'home', install_id: context.install_id,
            installation_generation: context.installation_generation, version: manifest.version, manifest_digest: manifestDigest } }) }],
      };
      if (manifest.actions) contribution.actions = manifest.actions.map(action => ({ capability_id: action.capability_id, version: action.version,
        handle: async (caller, input) => {
          const response = await contribution.routes![0]!.handle({ method: 'POST', pathname: '/call', params: {}, query: {}, actor_id: caller.actor_id,
            execution: { signal: caller.signal, beforeEffect: caller.beforeEffect, page_context: caller.page_context, locale: caller.locale,
              assert_authority_current: caller.assert_authority_current, retainBackgroundAuthority: caller.retainBackgroundAuthority }, body: { operation: action.action.local_id, input } });
          const body = response.body as { value?: unknown; error?: unknown; outcome?: string } | undefined;
          if (response.status !== 200) {
            if (body?.outcome === 'unknown') throw new ActionError('actions.outcome_unknown', String(body.error));
            throw new Error(String(body?.error ?? '插件操作未完成'));
          }
          return body?.value;
        } }));
      return contribution;
    },
    async stop() { const current = [...lanes.values()], lane = background; lanes.clear(); background = undefined;
      await Promise.all([lane?.stop(), ...current.map(item => item.then(runner => runner.stop(), () => undefined))]); },
  };
  rememberInstalledActionSource(definition, release, host.grantedCapabilities);
  return definition;
}
