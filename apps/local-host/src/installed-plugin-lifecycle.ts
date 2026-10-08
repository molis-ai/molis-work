/**
 * What a person can do to a generated plugin installed in a project: install, upgrade, roll back, switch off and on,
 * uninstall. Plugin Runtime owns the installation facts; this adds what only the Host knows around them: the approval
 * the person gave, the secrets they typed in the consent dialog, the data an uninstall kept, the prompts and the actions
 * the plugin shows. An action that does not finish leaves none of that behind.
 */
import type { PluginDefinition, PluginInstanceRecord, PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentBuilderPorts, AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import type { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginPlatform } from './plugin-platform.js';
import type { PluginSecrets } from './plugin-builder/secrets.js';
import { releaseVersion } from './plugin-builder/installed.js';

export const APPROVED_KEY = 'plugin-builder:agent-studio:approved:';

export const covered = (next: SandboxEffects, approved: SandboxEffects) =>
  Object.entries(next).every(([key, values]) => (values as string[]).every(value => ((approved as Record<string, string[]>)[key] ?? []).includes(value)));

export interface InstalledLifecycleContext {
  platform: PluginPlatform;
  /** The project's own store, where approvals live. */
  storage: PluginPrivateStorage;
  privateStorage: SqlitePluginPrivateStorage;
  secrets: PluginSecrets;
  recoveryErrors: Map<string, string>;
  closed(): boolean;
  recordFor(pluginId: string): PluginInstanceRecord | undefined;
  releaseFor(pluginId: string): AgentRelease | undefined;
  approvedFor(pluginId: string): SandboxEffects | null;
  definition(release: AgentRelease, approved: SandboxEffects): PluginDefinition;
  expose(release: AgentRelease): Promise<void>;
  withdraw(pluginId: string): void;
  registerPrompts(release: AgentRelease, state: 'enabled' | 'disabled'): void;
  /** Reminders and scheduled operations of one installation stop with it. */
  cancelScheduled(pluginId: string, installId: string): void;
  /** What the Host remembers of an uninstalled installation: its prompts and its code. */
  forget(pluginId: string, installId: string): void;
}

type Secret = { name: string; header: string; value: string };
type Grants = { consent?: unknown; keepData?: unknown; discardKeptData?: unknown; secrets?: unknown };

/** The secrets the consent dialog collected, each for a reference the release declared. */
function secretsOf(value: unknown, release: AgentRelease): Secret[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('密钥的格式不对');
  return value.map((item): Secret => {
    const { name, header, value: secret } = (item ?? {}) as Record<string, unknown>;
    if (typeof name !== 'string' || typeof header !== 'string' || typeof secret !== 'string') throw new Error('密钥的格式不对');
    if (!(release.permissions.secretRefs ?? []).includes(name)) throw new Error('这个插件没有声明要用密钥「' + name + '」');
    return { name, header, value: secret };
  });
}

export function installedLifecycle(c: InstalledLifecycleContext): AgentBuilderPorts['lifecycle'] {
  const { platform } = c;
  const uninstall = async (release: AgentRelease, record: PluginInstanceRecord, keepData: boolean) => {
    c.withdraw(release.pluginId); platform.supervisor.revoke(release.pluginId);
    c.cancelScheduled(release.pluginId, record.install_id); c.secrets.remove(release.pluginId);
    await platform.runtime.uninstall(record.install_id, { retain_private_data: keepData });
    c.forget(release.pluginId, record.install_id);
    if (!keepData) c.privateStorage.deleteInstallationData(record.install_id);
    c.storage.delete(APPROVED_KEY + release.pluginId); c.recoveryErrors.delete(release.pluginId);
  };
  /**
   * A confirmed install is a fresh installation, even if the Supervisor still remembers the revocation of an earlier
   * one. The data an uninstall kept follows the rules of Plugin Runtime; only the person's word (`discardKeptData`)
   * drops it. An install that does not finish is uninstalled again, so it blocks neither a retry nor an enable.
   */
  const install = async (release: AgentRelease, grants: Grants) => {
    const pluginId = release.pluginId, secrets = secretsOf(grants.secrets, release);
    const entry = { definition: c.definition(release, release.permissions), grants: ['storage:private'] };
    const earlier = platform.runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature === entry.definition.manifest.publisher.signature);
    const kept = earlier?.state === 'uninstalled' && earlier.retain_private_data === true;
    const { install } = platform.runtime.install({ ...entry, deployment: 'local', ...(grants.discardKeptData === true ? { discard_kept_data: true } : {}) });
    let dropped: ReturnType<SqlitePluginPrivateStorage['snapshotInstallationData']> | undefined;
    try {
      if (kept && grants.discardKeptData === true) { dropped = c.privateStorage.snapshotInstallationData(install.install_id); c.privateStorage.deleteInstallationData(install.install_id); }
      for (const secret of secrets) c.secrets.save(pluginId, secret);
      c.storage.set(APPROVED_KEY + pluginId, JSON.stringify(release.permissions));
      await platform.start([entry]);
      const state = platform.supervisor.state(pluginId)?.code === 'plugin_revoked' ? await platform.supervisor.enable(pluginId) : platform.supervisor.state(pluginId);
      if (state?.status !== 'running') throw new Error('安装没有完成：' + (state?.message ?? '插件未能启动'));
      await c.expose(release); c.registerPrompts(release, 'enabled'); c.recoveryErrors.delete(pluginId);
    } catch (error) {
      // What the cleanup itself cannot do is not worth more than the error that started it.
      try { await uninstall(release, c.recordFor(pluginId) ?? install, kept); } catch { /* reported below */ }
      try { if (dropped) c.privateStorage.restoreInstallationData(install.install_id, dropped); } catch { /* reported below */ }
      throw error;
    }
  };
  return async (action, release, input) => {
    if (c.closed()) throw new Error('安装运行入口已关闭');
    const grants = (input ?? {}) as Grants, pluginId = release.pluginId, consent = grants.consent === true, record = c.recordFor(pluginId);
    if (action === 'install') {
      if (record) throw new Error('这个插件已经安装，可以直接打开或升级');
      if (!consent) throw new Error('安装前请确认插件要使用的权限');
      return install(release, grants);
    }
    if (!record) throw new Error('这个插件还没有安装');
    if (action === 'upgrade' || action === 'rollback') {
      const verb = action === 'upgrade' ? '升级' : '回滚', off = record.state === 'disabled';
      if (record.state === 'quarantined') throw new Error('插件多次启动失败，已被隔离，不能' + verb + '：请先卸载并保留数据，再重新安装');
      const approved = c.approvedFor(pluginId) ?? {};
      if (!covered(release.permissions, approved) && !consent) throw new Error('这个版本需要新的权限，请确认后再切换');
      const nextApproval = covered(release.permissions, approved) ? approved : release.permissions;
      const next = c.definition(release, nextApproval);
      const state = action === 'upgrade' ? await platform.upgrade(pluginId, next) : await platform.rollback(pluginId, next);
      // A plugin the person switched off changes version and stays off; the installation's own record says whether it did.
      const moved = off ? c.recordFor(pluginId)?.version === releaseVersion(release.version) && c.recordFor(pluginId)?.state === 'disabled' : state?.status === 'running';
      if (!moved) throw new Error(state?.code === 'plugin_revoked' ? state.message! : verb + '没有完成：' + (state?.message ?? '插件未能启动') + (off ? '，仍停留在原版本，插件保持停用' : '，原版本继续可用'));
      c.storage.set(APPROVED_KEY + pluginId, JSON.stringify(nextApproval));
      if (!off) await c.expose(release);
      c.registerPrompts(release, off ? 'disabled' : 'enabled'); c.recoveryErrors.delete(pluginId); return;
    }
    if (action === 'disable') { c.withdraw(pluginId); platform.supervisor.revoke(pluginId); await platform.runtime.stop(record.install_id); c.registerPrompts(c.releaseFor(pluginId) ?? release, 'disabled'); return; }
    if (action === 'enable') {
      const approved = c.approvedFor(pluginId), installed = c.releaseFor(pluginId) ?? release;
      if (!approved) throw new Error('找不到此安装的批准记录，请先卸载并重新确认安装');
      // A switched-off plugin is unknown to the Supervisor after a restart: it is registered now, started below.
      if (!platform.supervisor.manifest(pluginId)) await platform.start([{ definition: c.definition(installed, approved), grants: record.grants }]);
      const state = await platform.supervisor.enable(pluginId);
      if (state.status !== 'running') throw new Error('启用没有完成：' + (c.recoveryErrors.get(pluginId) ?? state.message ?? ''));
      await c.expose(installed); c.registerPrompts(installed, 'enabled'); c.recoveryErrors.delete(pluginId); return;
    }
    if (action === 'uninstall') await uninstall(release, record, grants.keepData === true);
  };
}
