/**
 * What a person can do to a generated plugin installed in a project: install, upgrade, roll back, switch off and on,
 * uninstall. Plugin Runtime owns the installation facts; this adds what only the Host knows around them: the approval
 * the person gave, the secrets they typed in the consent dialog, the data an uninstall kept, the prompts and the actions
 * the plugin shows. An action that does not finish leaves none of that behind.
 */
import type { PluginDefinition, PluginInstanceRecord, PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentBuilderPorts, AgentRelease } from './installed-plugin-host.js';
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
  /**
   * `attempt`: this is the cleanup of an install that did not finish, not the person's uninstall; `earlier` is the
   * uninstalled record that install replaced, if there was one (a first-ever install has none). Plugin Runtime is asked
   * first. When it says the row is no longer that install's (another install has replaced it, or the person uninstalled
   * it meanwhile), the prompts, secrets, scheduled work and data under this plugin belong to that install or to that
   * choice and none of it is touched (false). A failed take-back still cleans up what the Host holds, then reports itself.
   */
  const uninstall = async (release: AgentRelease, record: PluginInstanceRecord, keepData: boolean, attempt?: { earlier?: PluginInstanceRecord }): Promise<boolean> => {
    let undone: unknown;
    if (attempt) {
      try { await platform.runtime.abandonInstall(record, attempt.earlier); } catch (failure) {
        if ((failure as { code?: unknown } | null)?.code === 'plugin_install_replaced') return false;
        undone = failure;
      }
    }
    c.withdraw(release.pluginId); platform.supervisor.revoke(release.pluginId);
    c.cancelScheduled(release.pluginId, record.install_id); c.secrets.remove(release.pluginId);
    if (!attempt) await platform.runtime.uninstall(record.install_id, { retain_private_data: keepData });
    else if (undone) throw undone;
    c.forget(release.pluginId, record.install_id);
    if (!keepData) c.privateStorage.deleteInstallationData(record.install_id);
    c.storage.delete(APPROVED_KEY + release.pluginId); c.recoveryErrors.delete(release.pluginId);
    return true;
  };
  /**
   * A confirmed install is a fresh installation, even if the Supervisor still remembers the revocation of an earlier
   * one. The data an uninstall kept follows the rules of Plugin Runtime; only the person's word (`discardKeptData`)
   * drops it. An install that does not finish is taken back: the uninstalled record it replaced returns exactly as it
   * was (version, digest, installation generation, kept-data flag) and so does the data that record kept, so the next
   * install is asked the same question and nothing blocks a retry or an enable. What the cleanup itself cannot undo is
   * reported with the error that started it. An install that another one has replaced meanwhile, or that the person
   * uninstalled meanwhile, has nothing of its own left to undo: the cleanup stops at once and the newer install keeps its
   * data, secrets, approval and running code, and the person's choice about the data stands.
   */
  const install = async (release: AgentRelease, grants: Grants) => {
    const pluginId = release.pluginId, secrets = secretsOf(grants.secrets, release);
    const entry = { definition: c.definition(release, release.permissions), grants: ['storage:private'] };
    const found = platform.runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature === entry.definition.manifest.publisher.signature);
    const earlier = found?.state === 'uninstalled' ? found : undefined, kept = earlier?.retain_private_data === true;
    const before = earlier && kept ? c.privateStorage.snapshotInstallationData(earlier.install_id) : undefined;
    const { install } = platform.runtime.install({ ...entry, deployment: 'local', ...(grants.discardKeptData === true ? { discard_kept_data: true } : {}) });
    try {
      if (before && grants.discardKeptData === true) c.privateStorage.deleteInstallationData(install.install_id);
      for (const secret of secrets) c.secrets.save(pluginId, secret);
      c.storage.set(APPROVED_KEY + pluginId, JSON.stringify(release.permissions));
      await platform.start([entry]);
      const state = platform.supervisor.state(pluginId)?.code === 'plugin_revoked' ? await platform.supervisor.enable(pluginId) : platform.supervisor.state(pluginId);
      if (state?.status !== 'running') throw new Error('安装没有完成：' + (state?.message ?? '插件未能启动'));
      await c.expose(release); c.registerPrompts(release, 'enabled'); c.recoveryErrors.delete(pluginId);
    } catch (error) {
      const unfinished: unknown[] = [];
      let ours = true;
      try { ours = await uninstall(release, install, kept, { earlier }); } catch (failure) { unfinished.push(failure); }
      try { if (before && ours) c.privateStorage.restoreInstallationData(install.install_id, before); } catch (failure) { unfinished.push(failure); }
      if (!unfinished.length) throw error;
      const said = (value: unknown) => value instanceof Error ? value.message : String(value);
      throw new AggregateError([error, ...unfinished], said(error) + '（撤销这次安装时也没有做完：' + unfinished.map(said).join('；') + '）', { cause: error });
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
