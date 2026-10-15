import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { AgentRelease } from './installed-plugin-host.js';
import type { PluginPlatform } from './plugin-platform.js';
import { exposeInstalledPlugin, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import { releaseVersion } from './plugin-builder/installed.js';

interface ExposurePorts {
  actions: Parameters<typeof exposeInstalledPlugin>[0]; platform: PluginPlatform;
  exposed: Map<string, InstalledPluginActions>; recoveryErrors: Map<string, string>;
  recordFor(pluginId: string): PluginInstanceRecord | undefined;
  closed(): boolean; withdraw(pluginId: string): void; changed(): void; catalog(): Promise<unknown>;
}

/** A stale catalog response belongs to its original exposure and enablement, not the plugin id's newest instance. */
export function installedPluginExposure(c: ExposurePorts) {
  return async (release: AgentRelease, onFailure?: 'caller') => {
    const pluginId = release.pluginId, record = c.recordFor(pluginId), epoch = c.platform.supervisor.generation(pluginId);
    if (c.closed() || !record || epoch === undefined || record.state !== 'running' || record.version !== releaseVersion(release.version)) throw new Error('原插件安装或启用状态已变化，不能采用旧曝光结果');
    c.withdraw(pluginId);
    let exposure: InstalledPluginActions | undefined;
    const current = () => {
      const now = c.recordFor(pluginId);
      return !c.closed() && c.exposed.get(pluginId) === exposure && c.platform.supervisor.generation(pluginId) === epoch
        && now?.install_id === record.install_id && now.installation_generation === record.installation_generation
        && now.version === record.version && now.manifest_digest === record.manifest_digest && now.state === 'running';
    };
    try {
      exposure = exposeInstalledPlugin(c.actions, release, async (id, operation, input, context) =>
        await c.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + id + '/call', actor_id: context.actor_id, execution: context, body: { operation, input } })
        ?? { status: 409, body: { error: '这个插件当前没有运行（可能已停用）' } },
        () => current() ? { available: true } : { available: false, code: 'actions.plugin_unavailable', reason: '插件已停用或版本已变更' });
      c.exposed.set(pluginId, exposure); c.changed();
      await c.catalog();
      if (!current()) throw new ActionError('actions.provider_replaced', '原插件曝光已失效，不能采用旧目录结果');
    } catch (error) {
      if (current()) {
        c.recoveryErrors.set(pluginId, error instanceof Error ? error.message : String(error));
        // Install/enable owns their cleanup; a version switch restores its old release and keys instead of revoking itself first.
        if (onFailure !== 'caller') { c.withdraw(pluginId); c.platform.supervisor.revoke(pluginId); await c.platform.runtime.stop(record.install_id); }
      } else throw new ActionError('actions.provider_replaced', '原插件曝光或启用已变化，旧请求不再恢复或停用当前实例');
      throw error;
    }
  };
}
