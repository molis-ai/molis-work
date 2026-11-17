import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginManifestDigest } from '@molis-ai/molis-work-plugin-runtime';
import { studioStorageInstallation } from './plugin-builder/storage.js';
import { HOME_INSTALL_SCOPE, sameInstalledRelease, type InstalledPackageControl } from './installed-release.js';
import { pluginErrors, type PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentRelease } from './installed-plugin-host.js';
import { APPROVED_KEY, finishInstalledPackage, type InstalledLifecycleContext } from './installed-plugin-lifecycle.js';
import { withSurfaceRestoration } from './surface-installation.js';
import { logInstalledUpgradeRefusal } from './home-unavailable-owners.js';

/** Runtime owns the version switch; this Host operation owns consent values and its exposure of the new release. */
export async function changeInstalledVersion(c: InstalledLifecycleContext, action: 'upgrade' | 'rollback', release: AgentRelease,
  record: PluginInstanceRecord, nextApproval: SandboxEffects, inputs: Array<{ name: string; header: string; value: string }>, control?: InstalledPackageControl): Promise<void> {
  const assertStanding = () => {
    if (c.closed() || control?.scopeOpen?.() === false) throw new ActionError('actions.host_closed', '原插件安装范围已经关闭');
    if (record.publisher_trust === 'pinned' && !c.trusted(record)) throw pluginErrors.publisher_revoked('插件发布者已经被撤销');
  };
  const assertAuthority = () => { control?.assertCurrent?.(); assertStanding(); };
  assertAuthority();
  const pluginId = release.pluginId, verb = action === 'upgrade' ? '升级' : '回滚', off = record.state === 'disabled';
  const earlier = c.releaseFor(pluginId), earlierApproval = c.approvedFor(pluginId), approval = c.storage.get(APPROVED_KEY + pluginId), next = c.definition(release, nextApproval);
  const epoch = off ? undefined : c.platform.supervisor.generation(pluginId);
  const ownsScope = () => !c.closed() && control?.scopeOpen?.() !== false && (off || c.platform.supervisor.generation(pluginId) === epoch);
  const changes = inputs.length ? c.secrets.stage?.(pluginId, inputs) : undefined;
  if (inputs.length && !changes) throw new Error('密钥存储尚未接通版本切换');
  const same = (expected: PluginInstanceRecord, requireState = true) => {
    const current = c.recordFor(pluginId);
    return ownsScope() && !!current && sameInstalledRelease(expected, current) && (!requireState || current.state === expected.state)
      && current.publisher_id === expected.publisher_id && current.publisher_signature === expected.publisher_signature;
  };
  if (!same(record)) throw new Error('插件安装已变化，请重新核对当前版本');
  const previousManifest = earlier?.packaged?.manifest;
  const key = APPROVED_KEY + pluginId;
  const persistApproval = { installId: studioStorageInstallation(c.project_id ?? HOME_INSTALL_SCOPE), key, value: JSON.stringify(nextApproval) };
  const databaseVersionChanged = (["project", "home"] as const).some(scope => {
    const previous = previousManifest?.databases?.[scope], nextDatabase = next.manifest.databases?.[scope];
    return previous && nextDatabase && previous.version !== nextDatabase.version;
  });
  const assertScope = () => {
    assertStanding();
    if (databaseVersionChanged && !ownsScope()) throw new ActionError('actions.provider_replaced', '原插件的启用状态已变更，请重新查看');
  };
  const assertCurrent = () => { control?.assertCurrent?.(); assertScope(); };
  let moved: PluginInstanceRecord | undefined;
  try {
    const state = action === 'upgrade' ? await c.platform.upgrade(pluginId, next, { assertCurrent, previousManifest, persistApproval,
      assertCommitted: databaseVersionChanged ? assertScope : undefined }) : await c.platform.rollback(pluginId, next);
    const current = c.recordFor(pluginId);
    if (ownsScope() && current?.installation_generation === record.installation_generation && current.install_id === record.install_id
      && current.version === next.manifest.version && current.manifest_digest === pluginManifestDigest(next.manifest)) moved = current;
    if (!moved || (off ? moved.state !== 'disabled' : state?.status !== 'running')) {
      if (databaseVersionChanged && state?.status === 'failed' && state.code) throw new ActionError(state.code, state.message ?? verb + '没有完成');
      throw new Error(verb + '没有完成：' + (state?.message ?? '插件未能启动'));
    }
    if (c.closed()) throw new Error('安装运行入口已关闭，不能保存切换结果');
    if (databaseVersionChanged) assertScope(); else assertCurrent();
    changes?.apply();
    if (!databaseVersionChanged) c.storage.set(key, persistApproval.value);
    if (!off) await c.expose(release, 'caller');
    const candidate = moved;
    await finishInstalledPackage(control, () => {
      if (databaseVersionChanged) assertScope(); else assertCurrent();
      if (!same(candidate)) throw new ActionError('actions.provider_replaced', '插件安装已变化，不能继续采用旧切换结果');
    }, () => {
      c.registerPrompts(release, off ? 'disabled' : 'enabled', action === 'rollback');
      c.recoveryErrors.delete(pluginId);
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'actions.provider_replaced' && (!databaseVersionChanged || !ownsScope())) throw error;
    // The Supervisor can reject authority after the Runtime saved this candidate, before returning its receipt.
    const current = c.recordFor(pluginId);
    if (!moved && ownsScope() && current?.install_id === record.install_id
      && current.installation_generation === record.installation_generation && current.version === next.manifest.version
      && current.manifest_digest === pluginManifestDigest(next.manifest)) moved = current;
    if (!moved || !same(moved)) {
      if (databaseVersionChanged && current?.last_error_code && (current.state === 'disabled' || current.state === 'crashed') && current.manifest_digest === record.manifest_digest) {
        c.withdraw(pluginId);
        if (earlier) c.registerPrompts(earlier, 'disabled');
        c.recoveryErrors.set(pluginId, error);
        logInstalledUpgradeRefusal(c.home, pluginId, c.library, current.last_error_code);
      }
      throw error;
    }
    // SQL, the edition and approval already share a commit. Do not return older code to this owner's new schema.
    if (databaseVersionChanged) {
      assertScope();
      c.withdraw(pluginId);
      const refusal = pluginErrors.upgrade_activation_failed('插件库已升级，新版本暂时无法使用');
      if (moved.state === 'running') await c.platform.runtime.pauseAfterUpgrade(moved.install_id, moved.manifest_digest, assertScope);
      c.registerPrompts(release, 'disabled');
      c.recoveryErrors.set(pluginId, refusal);
      logInstalledUpgradeRefusal(c.home, pluginId, c.library, refusal.code);
      throw refusal;
    }
    const adopted = moved;
    const failures: unknown[] = [];
    try { changes?.restore(); } catch (failure) { failures.push(failure); }
    if (earlier) {
      try {
        const original = c.definition(earlier, earlierApproval ?? earlier.permissions);
        const state = await withSurfaceRestoration(original.manifest, record, c.project_id, c.platform.runtime, {
          ownsMoved: () => same(adopted, false) && c.trusted(adopted),
          ownsRestored: () => same(record, false) && c.trusted(record),
        }, () => c.platform.rollback(pluginId, original));
        const restored = c.recordFor(pluginId);
        if (!restored || !same(restored) || !c.trusted(restored) || restored.install_id !== record.install_id || restored.installation_generation !== record.installation_generation
          || restored.version !== record.version || restored.manifest_digest !== record.manifest_digest || restored.state !== (off ? 'disabled' : 'running')
          || (!off && state?.status !== 'running')) throw new Error('原插件版本尚未恢复，请核对当前安装');
        if (approval === null) c.storage.delete(APPROVED_KEY + pluginId); else c.storage.set(APPROVED_KEY + pluginId, approval);
        if (!off) await c.expose(earlier, 'caller');
        if (!same(restored) || !c.trusted(restored)) throw new Error('原安装已变化，不能继续写入恢复结果');
        c.registerPrompts(earlier, off ? 'disabled' : 'enabled', true);
      } catch (failure) { failures.push(failure); }
    } else failures.push(new Error('原发行物当前不可读，不能自动恢复原版本'));
    if (!failures.length) throw error;
    throw new AggregateError([error, ...failures], '版本切换没有完成；原版本或密钥恢复仍需核对', { cause: error });
  }
  // A committed database upgrade is already active. Check who can receive its result outside activation recovery.
  if (databaseVersionChanged) control?.assertCurrent?.();
}
