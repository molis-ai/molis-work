import { randomUUID } from "node:crypto";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentGrant, PluginConsentGranter, PluginConsentRecord, PluginPublisherPin, PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginRuntimeDatabase } from "./repository.js";
import { consentGranter } from "./trust-rules.js";

// The consent ledger and the pinned publishers (ac-trust T1, specs/repository-anti-corruption/slices/ac-trust-install.md §3.3). One
// row per consent, written once and revoked by `revoked_at`, never rewritten or deleted. Both tables are Home-wide: a project's
// installs are its own, but what a person agreed to and whom they trust is one answer for the Home. Plugin Runtime owns the tables;
// anything else reads them through this port.

/** The two tables as one current schema; the Host composes it into the Home Runtime store's baseline. */
export const PLUGIN_TRUST_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS plugin_publishers (
      key_id TEXT PRIMARY KEY,
      public_key_spki_base64 TEXT NOT NULL,
      label TEXT NOT NULL,
      pinned_at TEXT NOT NULL,
      pinned_by TEXT NOT NULL,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS plugin_consents (
      consent_id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      publisher_signature TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('always_on', 'default_wiring', 'default_group', 'local_directory')),
      subject TEXT NOT NULL,
      manifest_digest TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      granted_by TEXT NOT NULL CHECK (granted_by IN ('user', 'host_build')),
      revoked_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS plugin_consents_active ON plugin_consents (plugin_id, publisher_signature, kind, subject) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS plugin_consents_plugin ON plugin_consents (plugin_id);
`;

/** What one install gives the ledger: the consents for the Manifest it installed. */
export interface PluginConsentEntry {
  readonly plugin_id: string;
  readonly publisher_signature: string;
  readonly manifest_digest: string;
  readonly granted_by: PluginConsentGranter;
  readonly grants: readonly PluginConsentGrant[];
  readonly at: string;
}

export interface PluginConsentLedger {
  /**
   * Writes the consents the entry gives, and answers the rows it wrote. A consent a person already holds (not revoked) for the same
   * plugin, publisher and subject is not written again. A `host_build` consent is not written when any row for it exists, revoked
   * or not: the Host agreeing again at the next start must not undo a person's revocation. A person's own consent after a
   * revocation is a new row.
   */
  record(entry: PluginConsentEntry): PluginConsentRecord[];
  /** Every row of a plugin, revoked ones included, oldest first. */
  consents(pluginId: string): PluginConsentRecord[];
  /** The publishers pinned, revoked ones included. */
  publishers(): PluginPublisherPin[];
  pinPublisher(pin: Omit<PluginPublisherPin, "revoked_at">): PluginPublisherPin;
}

const key = (row: { plugin_id: string; publisher_signature: string; kind: string; subject: string }) =>
  JSON.stringify([row.plugin_id, row.publisher_signature, row.kind, row.subject]);

function newRows(entry: PluginConsentEntry, existing: readonly PluginConsentRecord[]): PluginConsentRecord[] {
  const rows: PluginConsentRecord[] = [];
  for (const grant of entry.grants) {
    const same = existing.filter(row => key(row) === key({ ...entry, ...grant }));
    if (same.some(row => row.revoked_at === null) || (entry.granted_by === "host_build" && same.length > 0)) continue;
    if (rows.some(row => key(row) === key({ ...entry, ...grant }))) continue;
    rows.push({ consent_id: randomUUID(), plugin_id: entry.plugin_id, publisher_signature: entry.publisher_signature, kind: grant.kind, subject: grant.subject,
      manifest_digest: entry.manifest_digest, granted_at: entry.at, granted_by: entry.granted_by, revoked_at: null });
  }
  return rows;
}

/** A ledger kept in memory, for a Runtime or a test that has no Home. */
export class MemoryPluginConsentLedger implements PluginConsentLedger {
  private readonly rows: PluginConsentRecord[] = [];
  private readonly pins = new Map<string, PluginPublisherPin>();
  record(entry: PluginConsentEntry): PluginConsentRecord[] {
    const written = newRows(entry, this.rows.filter(row => row.plugin_id === entry.plugin_id));
    this.rows.push(...written);
    return written.map(row => ({ ...row }));
  }
  consents(pluginId: string): PluginConsentRecord[] { return this.rows.filter(row => row.plugin_id === pluginId).map(row => ({ ...row })); }
  publishers(): PluginPublisherPin[] { return [...this.pins.values()].map(pin => ({ ...pin })); }
  pinPublisher(pin: Omit<PluginPublisherPin, "revoked_at">): PluginPublisherPin {
    const pinned = this.pins.get(pin.key_id) ?? { ...pin, revoked_at: null };
    this.pins.set(pin.key_id, pinned);
    return { ...pinned };
  }
}

interface ConsentRow { consent_id: string; plugin_id: string; publisher_signature: string; kind: PluginConsentRecord["kind"]; subject: string; manifest_digest: string;
  granted_at: string; granted_by: PluginConsentGranter; revoked_at: string | null }

/** The ledger in the Home Runtime store (`PLUGIN_TRUST_SCHEMA_SQL`). */
export class SqlitePluginConsentLedger implements PluginConsentLedger {
  constructor(private readonly db: PluginRuntimeDatabase & { readonly isTransaction?: boolean }) {}
  record(entry: PluginConsentEntry): PluginConsentRecord[] {
    const insert = this.db.prepare(`INSERT INTO plugin_consents (consent_id, plugin_id, publisher_signature, kind, subject, manifest_digest, granted_at, granted_by, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`);
    const written = (): PluginConsentRecord[] => {
      const rows = newRows(entry, this.consents(entry.plugin_id));
      for (const row of rows) insert.run(row.consent_id, row.plugin_id, row.publisher_signature, row.kind, row.subject, row.manifest_digest, row.granted_at, row.granted_by);
      return rows;
    };
    // One transaction so the check and the writes see the same rows, unless the caller already holds one.
    if (this.db.isTransaction === true) return written();
    this.db.exec("BEGIN IMMEDIATE");
    try { const rows = written(); this.db.exec("COMMIT"); return rows; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  consents(pluginId: string): PluginConsentRecord[] {
    return (this.db.prepare("SELECT * FROM plugin_consents WHERE plugin_id = ? ORDER BY rowid").all(pluginId) as ConsentRow[]).map(row => ({ ...row }));
  }
  publishers(): PluginPublisherPin[] {
    return (this.db.prepare("SELECT * FROM plugin_publishers ORDER BY rowid").all() as PluginPublisherPin[]).map(row => ({ ...row }));
  }
  pinPublisher(pin: Omit<PluginPublisherPin, "revoked_at">): PluginPublisherPin {
    this.db.prepare(`INSERT INTO plugin_publishers (key_id, public_key_spki_base64, label, pinned_at, pinned_by, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT (key_id) DO NOTHING`).run(pin.key_id, pin.public_key_spki_base64, pin.label, pin.pinned_at, pin.pinned_by);
    return { ...(this.db.prepare("SELECT * FROM plugin_publishers WHERE key_id = ?").get(pin.key_id) as PluginPublisherPin) };
  }
}

/**
 * The installation record and grants are already saved when this runs. Project installs and the Home consent ledger can be in
 * different databases, so they share no atomic transaction: a ledger failure propagates unchanged and leaves the installation
 * saved without the missing consents. An unavailable Home ledger can therefore fail startup; the next supervisor replay retries
 * the install and the missing ledger writes. This does not roll back the install or grant consent after a failed ledger write.
 * A Runtime intentionally composed without a ledger records none.
 */
export function recordInstallConsents(ledger: PluginConsentLedger | undefined, record: PluginInstanceRecord, trust: PluginTrust, grants: readonly PluginConsentGrant[], at: string): void {
  if (!ledger || grants.length === 0) return;
  ledger.record({ plugin_id: record.plugin_id, publisher_signature: record.publisher_signature, manifest_digest: record.manifest_digest, granted_by: consentGranter(trust), grants, at });
}
