import { pluginManifestDigest } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentRelease } from './installed-plugin-host.js';
import { APPROVED_KEY, type InstalledLifecycleContext } from './installed-plugin-lifecycle.js';

/** Runtime owns the version switch; this Host operation owns consent values and its exposure of the new release. */
export async function changeInstalledVersion(c: InstalledLifecycleContext, action: 'upgrade' | 'rollback', release: AgentRelease,
  record: PluginInstanceRecord, nextApproval: SandboxEffects, inputs: Array<{ name: string; header: string; value: string }>): Promise<void> {
  const pluginId = release.pluginId, verb = action === 'upgrade' ? '升级' : '回滚', off = record.state === 'disabled';
  const earlier = c.releaseFor(pluginId), earlierApproval = c.approvedFor(pluginId), approval = c.storage.get(APPROVED_KEY + pluginId), next = c.definition(release, nextApproval);
  const epoch = c.platform.supervisor.generation(pluginId);
  const changes = inputs.length ? c.secrets.stage?.(pluginId, inputs) : undefined;
  if (inputs.length && !changes) throw new Error('密钥存储尚未接通版本切换');
  const same = (expected: PluginInstanceRecord) => {
    const current = c.recordFor(pluginId);
    return !c.closed() && c.platform.supervisor.generation(pluginId) === epoch && current?.install_id === expected.install_id
      && current.installation_generation === expected.installation_generation && current.state === expected.state
      && current.version === expected.version && current.manifest_digest === expected.manifest_digest;
  };
  if (!same(record)) throw new Error('插件安装已变化，请重新核对当前版本');
  let moved: PluginInstanceRecord | undefined;
  try {
    const state = action === 'upgrade' ? await c.platform.upgrade(pluginId, next) : await c.platform.rollback(pluginId, next);
    const current = c.recordFor(pluginId);
    if (!c.closed() && c.platform.supervisor.generation(pluginId) === epoch && current?.installation_generation === record.installation_generation && current.install_id === record.install_id
      && current.version === next.manifest.version && current.manifest_digest === pluginManifestDigest(next.manifest)) moved = current;
    if (!moved || (off ? moved.state !== 'disabled' : state?.status !== 'running')) throw new Error(verb + '没有完成：' + (state?.message ?? '插件未能启动'));
    if (c.closed()) throw new Error('安装运行入口已关闭，不能保存切换结果');
    changes?.apply();
    c.storage.set(APPROVED_KEY + pluginId, JSON.stringify(nextApproval));
    if (!off) await c.expose(release, 'caller');
    if (!same(moved)) throw new Error('插件安装已变化，不能继续采用旧切换结果');
    c.registerPrompts(release, off ? 'disabled' : 'enabled', action === 'rollback'); c.recoveryErrors.delete(pluginId);
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'actions.provider_replaced') throw error;
    if (!moved || !same(moved)) throw error;
    const failures: unknown[] = [];
    try { changes?.restore(); } catch (failure) { failures.push(failure); }
    if (earlier) {
      try {
        const state = await c.platform.rollback(pluginId, c.definition(earlier, earlierApproval ?? earlier.permissions));
        const restored = c.recordFor(pluginId);
        if (!restored || !same(restored) || restored.install_id !== record.install_id || restored.installation_generation !== record.installation_generation
          || restored.version !== record.version || restored.manifest_digest !== record.manifest_digest || restored.state !== (off ? 'disabled' : 'running')
          || (!off && state?.status !== 'running')) throw new Error('原插件版本尚未恢复，请核对当前安装');
        if (approval === null) c.storage.delete(APPROVED_KEY + pluginId); else c.storage.set(APPROVED_KEY + pluginId, approval);
        if (!off) await c.expose(earlier, 'caller');
        if (!same(restored)) throw new Error('原安装已变化，不能继续写入恢复结果');
        c.registerPrompts(earlier, off ? 'disabled' : 'enabled', true);
      } catch (failure) { failures.push(failure); }
    } else failures.push(new Error('原发行物当前不可读，不能自动恢复原版本'));
    if (!failures.length) throw error;
    throw new AggregateError([error, ...failures], '版本切换没有完成；原版本或密钥恢复仍需核对', { cause: error });
  }
}
