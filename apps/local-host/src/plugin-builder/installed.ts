/**
 * Installed agent-built plugins. Plugin Runtime owns identity, versions, upgrade, rollback, crash isolation and
 * uninstall; this definition only proxies to the plugin's sandboxed process. The plugin's code never runs in the
 * host process, and its interface is the host's component renderer, so no plugin script runs in the page either.
 */
import type { PluginDefinition, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects, SandboxIdentity, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { createSandboxRunner, sandboxServicesFor, SandboxError, type SandboxRunner, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { resolvePluginComponentCall, validatePluginPresentation } from '@molis-ai/molis-work-design-system';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { sandboxPluginManifest, sandboxUiContribution } from '../sandbox-plugin-manifest.js';
import { releaseVersion } from '../installed-release.js';
import { capabilityLimits, capabilityPolicyBinding, latestCapability, slowOperations, type Lane, type CapabilityExecution } from './capabilities.js';

/** Stable across versions of one build, so a new version upgrades the same installation and keeps its data. */
export const installedSignature = (buildId: string) => 'agent-built:' + buildId;
const GONE = new Set(['sandbox.process_exit', 'sandbox.stopped', 'sandbox.cancelled', 'sandbox.start_failed', 'sandbox.start_timeout', 'sandbox.operation_timeout', 'sandbox.memory_limit', 'sandbox.cpu_limit', 'sandbox.channel_limit', 'sandbox.channel_error', 'sandbox.protocol_error']);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * What a generated plugin declares to the Host: a release's Manifest, or for a trial of a build that has none yet, the one it
 * would install with at version 0.
 */
export function generatedPluginManifest(release: Pick<AgentRelease, 'pluginId' | 'version' | 'buildId' | 'design'>, earlierVersions: readonly number[] = []): PluginManifest {
  return sandboxPluginManifest({ pluginId: release.pluginId, version: releaseVersion(release.version), name: release.design.title,
    publisher: { publisher_id: 'molis-studio', signature: installedSignature(release.buildId) }, presentation: !!release.design.presentation, upgradesFrom: earlierVersions.map(releaseVersion) });
}

/** `host.capability` serves the platform capabilities the person approved; the broker still checks each call against them. */
export function sandboxedPluginDefinition(release: AgentRelease, approved: SandboxEffects, compatibleFrom: readonly number[], host: { capability?: SandboxServices['capability']; network?: SandboxServices['network']; capabilities?(): Promise<readonly CapabilityExecution[]>;
    /** Throws when the installation (or the publisher behind it) is no longer one that may act; asked before every effect of every service, storage included. */
    assertLive?(identity: Readonly<SandboxIdentity>): void } = {},
  /** What an installed package declared (already checked against `sandboxPluginManifest`); a generated plugin's is written from its release. */
  declared?: PluginManifest): PluginDefinition {
  if (release.design.presentation !== undefined) validatePluginPresentation(release.design.presentation, release.design.parts, release.design.contract);
  const manifest = declared ?? generatedPluginManifest(release, compatibleFrom), uiId = sandboxUiContribution(release.pluginId);
  // A model call runs in its own process, so the plugin's other reads and saves never wait behind it.
  const lanes = new Map<Lane, Promise<SandboxRunner>>();
  return {
    manifest,
    // Host provenance: Plugin Runtime then requires explicit grants and rolls back code without rolling back data.
    execution: 'sandbox',
    async start(context) {
      context.requireGrant('storage:private');
      // What the Host built for this activation goes to the sandbox through the broker, which still checks each call against the grants.
      const services = sandboxServicesFor(context.services, host);
      const identity: SandboxIdentity = { projectId: context.project_id ?? 'local', installationId: context.install_id, pluginId: release.pluginId, namespace: 'installed' };
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
      return {
        kind: 'app',
        routes: [{ route_id: 'studio.call', async handle(request) {
          let outcomeUnknown = false;
          try {
            const body = (request.body ?? {}) as { componentId?: unknown; binding?: unknown; payload?: unknown; operation?: unknown; input?: unknown };
            // The platform (its scheduler, or the action directory) runs an operation by id; people reach operations through parts.
            const scheduled = !!request.execution && typeof body.operation === 'string' && release.design.contract.operations.some(item => item.id === body.operation);
            const node = release.nodes.find(item => item.id === body.componentId);
            if (!scheduled && (!node || (body.binding !== 'read' && body.binding !== 'submit'))) throw new Error('未知的组件操作');
            const call = scheduled ? { operationId: body.operation as string, input: Object.hasOwn(body, 'input') ? body.input : {} } : resolvePluginComponentCall(node!, body.binding as 'read' | 'submit', body.payload ?? {});
            await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted();
            const operation = release.design.contract.operations.find(item => item.id === call.operationId)!;
            const dependencies = operation.effects.capabilities ?? [];
            const capabilities = dependencies.length ? await host.capabilities?.() ?? [] : [];
            if (host.capabilities) for (const id of dependencies) {
              const entry = latestCapability(capabilities, id);
              if (!entry || entry.installed === false) throw new SandboxError('plugin_builder.capability_unavailable', '这项功能依赖的能力当前不可用：' + id);
              if (operation.kind === 'query' && (entry.execution?.cost === 'metered' || entry.effect && entry.effect !== 'read')) {
                throw new SandboxError('plugin_builder.capability_denied', '查询不能自动调用收费或写入能力，请改为手动运行：' + id);
              }
            }
            const binding = capabilityPolicyBinding(operation.effects, capabilities);
            let policyChanged = false;
            const beforeEffect = async () => {
              await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted(); host.assertLive?.(identity);
              if (!host.capabilities || !dependencies.length) return;
              if (capabilityPolicyBinding(operation.effects, await host.capabilities()) !== binding) {
                policyChanged = true;
                throw new SandboxError('plugin_builder.capability_changed', '依赖能力的提供方、版本或执行策略已变更，本次调用已停止；请检查结果后再决定是否重试');
              }
              await request.execution?.beforeEffect(); request.execution?.signal?.throwIfAborted(); host.assertLive?.(identity);
            };
            await beforeEffect();
            const lane: Lane = slowOperations({ operations: [operation] }, capabilities).has(call.operationId) ? 'slow' : 'quick', pending = open(lane), active = await pending;
            try { return { status: 200, body: { value: await active.call(call.operationId, call.input as SandboxJson, {
              signal: request.execution?.signal, beforeEffect, limits: capabilityLimits(operation.effects, capabilities),
            }) } }; }
            catch (error) {
              // The worker may wrap a refused SDK call as sandbox.plugin_error; keep the trusted Host's reason.
              let failure = error;
              try { await beforeEffect(); } catch (current) { failure = current; }
              const gone = GONE.has((error as { code?: string }).code ?? '');
              if (gone && lanes.get(lane) === pending) lanes.delete(lane);
              if (policyChanged || error instanceof SandboxError && error.outcome === 'unknown') { outcomeUnknown = true; throw failure; }
              // A dead process restarts on the next call; the failed call itself is not replayed, so nothing is written twice.
              if (gone) { outcomeUnknown = true; throw new Error('本次插件调用已停止，结果可能尚未确认；请先检查结果，再决定是否重新执行'); }
              throw failure;
            }
          } catch (error) { return { status: 400, body: { error: message(error), ...(outcomeUnknown ? { outcome: 'unknown' } : {}) } }; }
        } }],
        views: [{ descriptor: { contribution_id: uiId, kind: 'primary-page', label: release.design.title, slots: [] },
          render: () => '<main data-installed-plugin="' + release.pluginId + '"></main>' }],
      };
    },
    async stop() { const current = [...lanes.values()]; lanes.clear(); await Promise.all(current.map(item => item.then(runner => runner.stop(), () => undefined))); },
  };
}
