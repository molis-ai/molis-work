import type { PluginInstanceRecord } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginConsentLedger } from '@molis-ai/molis-work-plugin-runtime';
import { consentRevision } from './consent-revision.js';
import type { PluginPlatform } from './plugin-platform.js';
import { repeatingFailure } from './host-log.js';

/** What a person is told about an installation whose publisher they took back. */
export const PUBLISHER_REVOKED_MESSAGE = '这个插件的发布者已被你撤销信任：它不再运行，数据还在，可以卸载';

/** A ledger that cannot be read is written when it starts failing, and again only once it has been read since. */
const ledgerFailures = repeatingFailure('plugins', 'publisher_ledger_unreadable');

/**
 * Whether the publisher behind an installed package is still one the person trusts (ac-trust T5b, BL-559, S-87). A package installation
 * holds the key it was signed with (`publisher_signature`) and may run only while the Home's ledger has that key pinned and not taken
 * back. What the ledger says is kept until the person next changes an agreement in this process (`consentRevision`: pinning and taking
 * back both count), so it is asked once between changes and not on every call. A ledger that cannot be read trusts nobody: the
 * installation stays denied rather than running on a guess.
 */
export function publisherStanding(ledger: Pick<PluginConsentLedger, 'publishers'>) {
  let at = -1, live = new Set<string>();
  const pinned = (): ReadonlySet<string> => {
    if (at === consentRevision()) return live;
    try { live = new Set(ledger.publishers().filter(pin => !pin.revoked_at).map(pin => pin.key_id)); at = consentRevision(); ledgerFailures.worked('ledger'); }
    catch (error) { live = new Set(); at = -1; ledgerFailures.failed('ledger', error); }
    return live;
  };
  return { trusted: (record: Pick<PluginInstanceRecord, 'publisher_trust' | 'publisher_signature'>): boolean =>
    record.publisher_trust !== 'pinned' || pinned().has(record.publisher_signature) };
}

/**
 * Stopping the installations whose publisher the person took back, their data kept. `suspend` does it to one (startup does, before it
 * would start them); `reconcile` does it to all of a project's once the person has changed an agreement since it last looked, which is
 * when the project is next asked about its plugins. Each project does its own: an installation is already denied at its next effect.
 */
export function publisherStops(c: { standing: ReturnType<typeof publisherStanding>; platform: Pick<PluginPlatform, 'supervisor' | 'runtime'>;
  recoveryErrors: Map<string, string>; withdraw(pluginId: string): void; records(): PluginInstanceRecord[] }) {
  const suspend = async (record: PluginInstanceRecord) => {
    c.recoveryErrors.set(record.plugin_id, PUBLISHER_REVOKED_MESSAGE);
    c.withdraw(record.plugin_id); c.platform.supervisor.revoke(record.plugin_id);
    try { if (record.state === 'running') await c.platform.runtime.stop(record.install_id); }
    catch (error) { c.recoveryErrors.set(record.plugin_id, PUBLISHER_REVOKED_MESSAGE + '（停用没有完成：' + (error instanceof Error ? error.message : String(error)) + '）'); }
  };
  let reconciledAt = consentRevision();
  const reconcile = async () => {
    if (reconciledAt === consentRevision()) return;
    reconciledAt = consentRevision();
    for (const record of c.records()) if (!c.standing.trusted(record)) await suspend(record);
  };
  return { suspend, reconcile };
}
