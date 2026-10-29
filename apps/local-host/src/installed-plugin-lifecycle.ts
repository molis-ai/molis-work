/**
 * What a person can do to a generated plugin installed in a project: install, upgrade, roll back, switch off and on,
 * uninstall. Plugin Runtime owns the installation facts; this adds what only the Host knows around them: the approval
 * the person gave, the secrets they typed in the consent dialog, the data an uninstall kept, the prompts and the actions
 * the plugin shows. An action that does not finish leaves none of that behind.
 */
import { comparePluginVersions } from '@molis-ai/molis-work-plugin-sdk';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors, type PluginDefinition, type PluginInstanceRecord, type PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { AgentBuilderPorts } from './installed-plugin-host.js';
import type { InstalledRelease } from './installed-release.js';
import { leaveRefusal, UNSIGNED_TRUST, type SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import type { PluginPlatform } from './plugin-platform.js';

/** What the install lifecycle uses of a platform: a project's, or the Home's (BL-628). */
export type InstalledPluginPlatform = Pick<PluginPlatform, 'runtime' | 'supervisor' | 'start' | 'consents' | 'upgrade' | 'rollback'>;
import type { PluginSecrets } from './plugin-builder/secrets.js';
import { changeInstalledVersion } from './installed-plugin-version.js';

export const APPROVED_KEY = 'plugin-builder:agent-studio:approved:';

export const covered = (next: SandboxEffects, approved: SandboxEffects) =>
  Object.entries(next).every(([key, values]) => (values as string[]).every(value => ((approved as Record<string, string[]>)[key] ?? []).includes(value)));

export interface InstalledLifecycleContext {
  platform: InstalledPluginPlatform;
  /** The project's own store, where approvals live. */
  storage: PluginPrivateStorage;
  privateStorage: SqlitePluginPrivateStorage;
  secrets: PluginSecrets;
  recoveryErrors: Map<string, string>;
  closed(): boolean;
  /** Whether the publisher behind a package installation is still trusted (BL-559); a record not from a package always is. */
  trusted(record: PluginInstanceRecord): boolean;
  recordFor(pluginId: string): PluginInstanceRecord | undefined;
  releaseFor(pluginId: string): InstalledRelease | undefined;
  approvedFor(pluginId: string): SandboxEffects | null;
  definition(release: InstalledRelease, approved: SandboxEffects): PluginDefinition;
  expose(release: InstalledRelease, onFailure?: 'caller'): Promise<void>;
  withdraw(pluginId: string): void;
  registerPrompts(release: InstalledRelease, state: 'enabled' | 'disabled'): void;
  /** Reminders and scheduled operations of one installation stop with it. */
  /** What the Host remembers of an uninstalled installation: its prompts and its code. */
  forget(pluginId: string, installId: string): void;
}

type Secret = { name: string; header: string; value: string };
type Grants = { consent?: unknown; keepData?: unknown; discardKeptData?: unknown; secrets?: unknown };

/** The secrets the consent dialog collected, each for a reference the release declared. */
function secretsOf(value: unknown, release: InstalledRelease): Secret[] {
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
  const uninstall = async (release: InstalledRelease, record: PluginInstanceRecord, keepData: boolean, attempt?: { earlier?: PluginInstanceRecord }): Promise<boolean> => {
    let undone: unknown;
    if (attempt) {
      try { await platform.runtime.abandonInstall(record, attempt.earlier); } catch (failure) {
        if ((failure as { code?: unknown } | null)?.code === 'plugin.install_replaced') return false;
        undone = failure;
      }
    }
    c.withdraw(release.pluginId); platform.supervisor.revoke(release.pluginId);
    c.secrets.remove(release.pluginId);
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
  const install = async (release: InstalledRelease, grants: Grants) => {
    const pluginId = release.pluginId, secrets = secretsOf(grants.secrets, release);
    const entry = { definition: c.definition(release, release.permissions), grants: ['storage:private'], trust: release.packaged?.trust ?? UNSIGNED_TRUST };
    const found = platform.runtime.list().find(item => item.plugin_id === pluginId && item.publisher_signature === entry.definition.manifest.publisher.signature);
    const earlier = found?.state === 'uninstalled' ? found : undefined, kept = earlier?.retain_private_data === true;
    const before = earlier && kept ? c.privateStorage.snapshotInstallationData(earlier.install_id) : undefined;
    const { install } = platform.runtime.install({ ...entry, deployment: 'local', ...(grants.discardKeptData === true ? { discard_kept_data: true } : {}) });
    try {
      if (before && grants.discardKeptData === true) c.privateStorage.deleteInstallationData(install.install_id);
      for (const secret of secrets) c.secrets.save(pluginId, secret);
      c.storage.set(APPROVED_KEY + pluginId, JSON.stringify(release.permissions));
      await platform.start([entry]);
      const state = platform.supervisor.state(pluginId)?.code === 'plugin.revoked' ? await platform.supervisor.enable(pluginId) : platform.supervisor.state(pluginId);
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
  /**
   * A signed package is replaced by a newer package of the same plugin and publisher, and by nothing else (BL-623). The person's confirmation approves exactly
   * the permissions the new package asks for. A switched-off installation is not registered with the Supervisor after a restart; the version moves under the new
   * definition all the same and never starts it, as for any switched-off plugin.
   */
  const upgradePackage = async (release: InstalledRelease, record: PluginInstanceRecord, grants: Grants) => {
    const pluginId = release.pluginId;
    if (record.publisher_trust !== 'pinned' || !release.packaged) throw pluginErrors.definition_conflict('已装的插件和这个包不是同一种来源，不能互相替换：先卸载，再装');
    if (!c.trusted(record)) throw pluginErrors.publisher_revoked('这个插件的发布者已被撤销信任，不能升级；数据还在，可以卸载');
    if (record.state === 'quarantined') throw new Error('插件多次启动失败，已被隔离，不能升级：请先卸载并保留数据，再重新安装');
    const installed = c.releaseFor(pluginId), approved = c.approvedFor(pluginId);
    if (!installed?.packaged) throw new Error(c.recoveryErrors.get(pluginId) ?? '找不到已安装版本的包，不能升级');
    if (!approved) throw new Error('找不到此安装的批准记录，请先卸载并重新确认安装');
    const next = release.packaged.manifest;
    if (comparePluginVersions(next.version, record.version) <= 0) throw pluginErrors.upgrade_required('这个包的版本是 ' + next.version + '，不高于已装的 ' + record.version + '：不是升级');
    if (!(next.upgrade_compatibility?.compatible_from_versions ?? []).includes(record.version)) throw pluginErrors.upgrade_required('这个包的清单没有声明能从已装的 ' + record.version + ' 直接升级（upgrade_compatibility.compatible_from_versions）');
    return changeInstalledVersion(c, 'upgrade', release, record, release.permissions, secretsOf(grants.secrets, release));
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
      const verb = action === 'upgrade' ? '升级' : '回滚';
      if (record.publisher_trust === 'pinned' && action === 'rollback') throw pluginErrors.state_invalid('从签名的包装进来的插件还不能' + verb + '：先卸载，再装新的包');
      if (record.publisher_trust === 'pinned' || (release as InstalledRelease).packaged) return upgradePackage(release, record, grants);
      if (record.state === 'quarantined') throw new Error('插件多次启动失败，已被隔离，不能' + verb + '：请先卸载并保留数据，再重新安装');
      const approved = c.approvedFor(pluginId) ?? {};
      if (!covered(release.permissions, approved) && !consent) throw new Error('这个版本需要新的权限，请确认后再切换');
      const nextApproval = covered(release.permissions, approved) ? approved : release.permissions;
      return changeInstalledVersion(c, action, release, record, nextApproval, secretsOf(grants.secrets, release));
    }
    // A 常开 agreement that stands keeps the installation on: asked before anything is withdrawn, revoked or stopped.
    const refusal = action === 'disable' || action === 'uninstall' ? leaveRefusal(platform.consents ?? undefined, record, action === 'disable' ? '停用' : '卸载') : undefined;
    if (refusal) throw refusal;
    if (action === 'disable') {
      c.withdraw(pluginId); platform.supervisor.revoke(pluginId);
      // The Runtime records the switch-off of a crashed or never-started installation as disabled; it refuses a quarantined one, which stays quarantined and is off all the same.
      await platform.runtime.stop(record.install_id).catch((error: unknown) => {
        if (!(error instanceof ActionError && error.code === 'plugin.state_invalid')) throw error;
      });
      c.registerPrompts(c.releaseFor(pluginId) ?? release, 'disabled'); return;
    }
    if (action === 'enable') {
      if (!c.trusted(record)) throw pluginErrors.publisher_revoked('这个插件的发布者已被撤销信任，不能再启用；数据还在，可以卸载');
      const approved = c.approvedFor(pluginId), installed = c.releaseFor(pluginId) ?? release, packaged = c.releaseFor(pluginId)?.packaged;
      if (!approved) throw new Error('找不到此安装的批准记录，请先卸载并重新确认安装');
      // A stopped package may have had its optional grants changed. Register its verified definition with the Runtime's current grants,
      // without starting it, before enable: the supervisor's earlier entry is not another owner of those grants.
      if (record.state !== 'running' || !platform.supervisor.manifest(pluginId)) {
        const definition = c.definition(installed, approved); platform.runtime.register(definition);
        await platform.start([{ definition, grants: record.grants, enabled: false, ...packaged ? { trust: packaged.trust } : {} }]);
      }
      const state = await platform.supervisor.enable(pluginId);
      if (state.status !== 'running') throw new Error('启用没有完成：' + (c.recoveryErrors.get(pluginId) ?? state.message ?? ''));
      await c.expose(installed); c.registerPrompts(installed, 'enabled'); c.recoveryErrors.delete(pluginId); return;
    }
    if (action === 'uninstall') await uninstall(release, record, grants.keepData === true);
  };
}
