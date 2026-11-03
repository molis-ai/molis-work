import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginPlatform } from './plugin-platform.js';
import { exposeInstalledPlugin, type InstalledPluginActions } from './plugin-builder/exposed-actions.js';
import { installedVersion, type InstalledRelease } from './installed-release.js';
import { pluginPagesFor } from './plugin-page-authority.js';

interface ExposurePorts {
  homeDirectory: string; actorId: string;
  actions: Parameters<typeof exposeInstalledPlugin>[0]; platform: Pick<PluginPlatform, 'runtime' | 'supervisor' | 'router'>;
  exposed: Map<string, InstalledPluginActions>; recoveryErrors: Map<string, string>;
  recordFor(pluginId: string): PluginInstanceRecord | undefined;
  closed(): boolean; withdraw(pluginId: string): void; changed(): void; catalog(): Promise<unknown>;
}

/** A stale catalog response belongs to its original exposure and enablement, not the plugin id's newest instance. */
export function installedPluginExposure(c: ExposurePorts) {
  return async (release: InstalledRelease, onFailure?: 'caller') => {
    const pluginId = release.pluginId, record = c.recordFor(pluginId), epoch = c.platform.supervisor.generation(pluginId);
    if (c.closed() || !record || epoch === undefined || record.state !== 'running' || record.version !== installedVersion(release)) throw new Error('原插件安装或启用状态已变化，不能采用旧曝光结果');
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
        await c.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + id + '/call', actor_id: context.actor_id,
          execution: { signal: context.signal, beforeEffect: context.beforeEffect, page_context: context.page_context, locale: context.locale, assert_authority_current: context.assert_authority_current }, body: { operation, input } })
        ?? { status: 409, body: { error: '这个插件当前没有运行（可能已停用）' } },
        () => current() ? { available: true } : { available: false, code: 'actions.plugin_unavailable', reason: '插件已停用或版本已变更' }, { install_id: record.install_id, installation_generation: record.installation_generation });
      c.exposed.set(pluginId, exposure); c.changed();
      const withdrawPage = pluginPagesFor(c.homeDirectory).connect({
        manifest: c.platform.supervisor.manifest(pluginId)!, install_id: record.install_id, project_id: c.actions.project_id, actor_id: c.actorId,
        requestAllowed: (method, path) => method === 'POST' && path === '/api/plugin-builder/installed/' + pluginId + '/call',
        assertCurrent(permission) {
          if (!current() || (permission && !c.recordFor(pluginId)?.grants.includes(permission))) throw new ActionError('actions.forbidden', '插件页面的安装权限已变化');
        },
      });
      const dispose = exposure.dispose; exposure.dispose = () => { withdrawPage(); dispose(); };
      await c.catalog();
      if (!current()) throw new ActionError('actions.provider_replaced', '原插件曝光已失效，不能采用旧目录结果');
    } catch (error) {
      if (current()) {
        c.recoveryErrors.set(pluginId, error instanceof Error ? error.message : String(error));
        // Install/enable owns their cleanup; a version switch restores its old release and keys instead of revoking itself first.
        if (onFailure !== 'caller') {
          c.withdraw(pluginId); c.platform.supervisor.revoke(pluginId);
          // The installation may have left running while this exposure was reading the catalog; its own failure is what the person needs.
          await c.platform.runtime.stop(record.install_id).catch((error: unknown) => {
            if (!(error instanceof ActionError && error.code === 'plugin.state_invalid')) throw error;
          });
        }
      } else throw new ActionError('actions.provider_replaced', '原插件曝光或启用已变化，旧请求不再恢复或停用当前实例');
      throw error;
    }
  };
}
