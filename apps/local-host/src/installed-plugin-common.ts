/**
 * What a project's installed plugins (`openInstalledPlugins`) and the Home's (`openHomeInstalledPlugins`) share: which rows are theirs,
 * the person's approval, a signed package read back under its publisher's standing, the public actions they offer and the catalog
 * those actions are priced against, and bringing every installation back when the host opens. Each host keeps only what has no
 * counterpart in the other: where its approvals and prompts are kept, what its sandbox identity names, and its own admission checks.
 */
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SurfaceInstallationRef } from '@molis-ai/molis-work-contracts/services/surface-composition';
import { sameInstalledRelease } from './installed-release.js';
import { pluginErrors, type PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { isPackageReadFailure } from './installed-recovery-errors.js';
import { holdsFailedDatabaseUpgrade } from '@molis-ai/molis-work-plugin-runtime';
import { APPROVED_KEY, isPendingUninstall, onlyOne, type InstalledPluginPlatform } from './installed-plugin-lifecycle.js';
import type { installedDefinitions } from './installed-plugin-definition.js';
import type { InstalledRelease } from './installed-release.js';
import { PUBLISHER_REVOKED_MESSAGE, type publisherStanding, type publisherStops } from './installed-publisher-standing.js';
import type { RecoveryErrors } from './installed-recovery-errors.js';
import { installedCapabilityCatalog, type CatalogCapability } from './installed-plugin-catalog.js';
import { exposedOperationPolicies, type InstalledPluginActions } from './installed-plugin-exposed-actions.js';
import type { SandboxPackageStore } from './sandbox-package-store.js';

type Standing = ReturnType<typeof publisherStanding>;
type Definition = ReturnType<ReturnType<typeof installedDefinitions>['definition']>;

/** A row a signed package's installation wrote: what a project's installed plugins (and the Home's) run, beside the built-in ones on the same platform. */
export const isInstalledPackage = (record: Pick<PluginInstanceRecord, 'publisher_trust' | 'execution'>): boolean => record.publisher_trust === 'pinned' && record.execution === 'sandbox';

/** The host's own rows of the Runtime (`ours`), never an uninstalled one; `retryUninstall` also finds the one tombstone of the plugin whose clean-up did not finish (BL-915). */
export function installedRecords(list: () => PluginInstanceRecord[], ours: (record: PluginInstanceRecord) => boolean) {
  const records = () => list().filter(item => ours(item) && item.state !== 'uninstalled');
  const pendingUninstalls = () => list().filter(isPendingUninstall);
  const recordFor = (pluginId: string, retryUninstall = false) => records().find(item => item.plugin_id === pluginId)
    ?? (retryUninstall ? onlyOne(pendingUninstalls().filter(item => item.plugin_id === pluginId)) : undefined);
  return { records, pendingUninstalls, recordFor };
}

/** The effects the person approved for a plugin's installation, kept in the host's own store; null when there is no approval. */
export function installedApprovals(storage: { get(key: string): string | null }) {
  return (pluginId: string): SandboxEffects | null => {
    const raw = storage.get(APPROVED_KEY + pluginId);
    return raw === null ? null : JSON.parse(raw);
  };
}

/**
 * A signed package's release, read back (and checked again) from the Home's package store the first time an installation asks for it.
 * A signature that checks is not enough: the publisher must still be trusted (BL-559). Throws what stops it, for the caller to record.
 */
export function packagedReleases(packages: SandboxPackageStore, standing: Standing) {
  const loaded = new Map<string, InstalledRelease>();
  return (record: PluginInstanceRecord): InstalledRelease => {
    if (!standing.trusted(record)) throw pluginErrors.publisher_revoked(PUBLISHER_REVOKED_MESSAGE);
    const key = JSON.stringify([record.plugin_id, record.publisher_signature, record.version]);
    let release = loaded.get(key);
    if (!release) {
      release = packages.load(record.plugin_id, record.publisher_signature, record.version);
      loaded.set(key, release);
    }
    return release;
  };
}

/** The public actions the host's installations offer now, by plugin id; every offer or withdrawal moves the revision the catalog reads under. */
export function installedOffers() {
  const exposed = new Map<string, InstalledPluginActions>();
  let revision = 0;
  return {
    exposed,
    revision: () => revision,
    changed: () => { revision++; },
    withdraw: (pluginId: string) => {
      exposed.get(pluginId)?.dispose();
      exposed.delete(pluginId);
      revision++;
    },
  };
}

/**
 * The capability catalog the host's installations are priced against. Read again when an install, upgrade or withdrawal lands while it
 * is being read, and again while repricing the offered actions changes any of them; a closed host reads nothing.
 */
export function installedCatalog(home: string, offers: ReturnType<typeof installedOffers>, read: () => Promise<CatalogCapability[]>, closed: () => boolean) {
  return installedCapabilityCatalog(home, async () => {
    for (;;) {
      const revision = offers.revision();
      let snapshot: CatalogCapability[];
      try { snapshot = await read(); }
      catch (error) {
        if (closed()) return [];
        if (revision !== offers.revision()) continue;
        throw error;
      }
      if (closed()) return [];
      if (revision !== offers.revision()) continue;
      const costs = exposedOperationPolicies([...offers.exposed.values()].map(entry => entry.release), snapshot);
      let changed = false;
      for (const [pluginId, entry] of offers.exposed) changed = entry.refresh(costs.get(pluginId)!) || changed;
      if (!changed) return snapshot;
    }
  });
}

/** Whether an installation comes back switched off: the person switched it off, it is quarantined, or its database upgrade failed. */
const heldOff = (record: PluginInstanceRecord) => record.state === 'disabled' || record.state === 'quarantined';

/**
 * Brings each installation back when the host opens. One that cannot start keeps its reason with its installation and starts nothing
 * else less. `admit` is the host's own check of a release before it starts; `blocked` is a reason it may not start yet, its prompts
 * registered switched off; `heldBack` starts one registered but not enabled (a dual-instance half whose Home half is not running).
 */
export type InstalledPackageRepair = { plugin_id: string; expected_installation: SurfaceInstallationRef; bundle?: unknown };

export function installedPackageRecovery(ctx: {
  packages: SandboxPackageStore;
  scope: SurfaceInstallationRef['scope'];
  recordFor(pluginId: string): PluginInstanceRecord | undefined;
  records(): PluginInstanceRecord[];
  standing: Standing;
  stops: ReturnType<typeof publisherStops>;
  releaseFor(pluginId: string): InstalledRelease | undefined;
  approvedFor(pluginId: string): SandboxEffects | null;
  recoveryErrors: RecoveryErrors;
  registerPrompts(release: InstalledRelease, state: 'enabled' | 'disabled'): void;
  platform: InstalledPluginPlatform;
  definition(release: InstalledRelease, approved: SandboxEffects): Definition;
  expose(release: InstalledRelease): Promise<void>;
  /** What the person is told when an installation has no approval to start under. */
  unapproved: string;
  admit?(release: InstalledRelease): void;
  blocked?(record: PluginInstanceRecord): Error | undefined;
  heldBack?(record: PluginInstanceRecord, release: InstalledRelease): boolean;
}) {
  async function restore(record: PluginInstanceRecord, assertCurrent?: () => void): Promise<void> {
    assertCurrent?.();
    if (!ctx.standing.trusted(record)) {
      await ctx.stops.suspend(record);
      return;
    }
    const release = ctx.releaseFor(record.plugin_id), approved = ctx.approvedFor(record.plugin_id);
    // The reason its package could not be read back is already recorded, with its own code (BL-915): kept, not wrapped.
    if (!release) {
      if (!ctx.recoveryErrors.has(record.plugin_id)) ctx.recoveryErrors.set(record.plugin_id, '找不到已安装版本 ' + record.version + ' 的发布记录');
      return;
    }
    if (!approved) throw pluginErrors.grant_denied(ctx.unapproved);
    ctx.admit?.(release);
    const blocked = ctx.blocked?.(record);
    const heldBack = ctx.heldBack?.(record, release) === true;
    ctx.registerPrompts(release, blocked || heldOff(record) || heldBack || holdsFailedDatabaseUpgrade(record) ? 'disabled' : 'enabled');
    if (blocked) throw blocked;
    const trust = release.packaged ? { trust: release.packaged.trust } : {};
    if (heldOff(record) || heldBack) {
      const restored = ctx.definition(release, approved);
      ctx.platform.runtime.register(restored);
      await ctx.platform.start([{ definition: restored, grants: record.grants, enabled: false, ...trust }], { assertCurrent });
      return;
    }
    // A packaged release starts under the pin it was installed with, read back from its verified package, as its install did (S-75).
    const report = await ctx.platform.start([{ definition: ctx.definition(release, approved), grants: record.grants, ...trust }], { assertCurrent });
    assertCurrent?.();
    if (report.running.includes(record.plugin_id)) await ctx.expose(release);
    else {
      ctx.registerPrompts(release, 'disabled');
      throw new ActionError('actions.plugin_unavailable', ctx.platform.supervisor.state(record.plugin_id)?.message ?? '安装插件未能恢复');
    }
  }

  return {
    async open() {
      for (const record of ctx.records()) {
        try { await restore(record); }
        catch (error) { ctx.recoveryErrors.set(record.plugin_id, error); }
      }
    },
    damaged(record: PluginInstanceRecord) {
      if (!isPackageReadFailure(ctx.recoveryErrors.code(record.plugin_id))) return;
      if (ctx.platform.supervisor.state(record.plugin_id)?.status === 'running') return;
      return { record, manifest: ctx.packages.installedManifest(record) };
    },
    async repair({ plugin_id, expected_installation, bundle }: InstalledPackageRepair, assertAuthority: () => void) {
      const check = () => {
        assertAuthority();
        const current = ctx.recordFor(plugin_id);
        if (expected_installation.scope !== ctx.scope || !current || !sameInstalledRelease(expected_installation, current))
          throw pluginErrors.install_replaced('原安装已变化，请重新打开插件');
        if (!ctx.standing.trusted(current)) throw pluginErrors.publisher_revoked(PUBLISHER_REVOKED_MESSAGE);
        return current;
      };
      const record = check();
      if (!isPackageReadFailure(ctx.recoveryErrors.code(plugin_id)))
        throw pluginErrors.state_invalid('这个安装当前无需装回');
      if (!ctx.approvedFor(plugin_id)) throw pluginErrors.grant_denied(ctx.unapproved);
      ctx.packages.repair(record, bundle);
      try {
        await restore(record, check);
        check();
        if (!ctx.releaseFor(plugin_id)) throw pluginErrors.package_invalid('装回的插件包读不出来');
        ctx.recoveryErrors.delete(plugin_id);
        return { plugin_id, version: record.version };
      } catch (error) {
        check();
        ctx.recoveryErrors.set(plugin_id, error);
        throw error;
      }
    },
  };
}
