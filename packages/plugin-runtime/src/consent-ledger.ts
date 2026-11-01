import { randomUUID } from "node:crypto";
import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentGrant, PluginConsentGranter, PluginConsentRecord, PluginPublisherPin, PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginRuntimeDatabase } from "./repository.js";
import { consentGranter, consentSubject } from "./trust-rules.js";

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
      kind TEXT NOT NULL CHECK (kind IN ('always_on', 'default_wiring', 'default_group', 'local_directory', 'project_reach')),
      subject TEXT NOT NULL,
      manifest_digest TEXT NOT NULL,
      granted_at TEXT NOT NULL,
      granted_by TEXT NOT NULL CHECK (granted_by IN ('user', 'host_build')),
      revoked_at TEXT,
      approved_capability_ids TEXT,
      CHECK ((kind = 'project_reach' AND granted_by = 'user' AND approved_capability_ids IS NOT NULL AND json_valid(approved_capability_ids) AND json_type(approved_capability_ids) = 'array')
        OR (kind <> 'project_reach' AND approved_capability_ids IS NULL))
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

/** Only the Host's project settings owner supplies these verified installation facts. */
export interface ProjectReachConsentEntry {
  readonly plugin_id: string;
  readonly publisher_signature: string;
  readonly manifest_digest: string;
  readonly project_id: string;
  readonly install_id: string;
  readonly approved_capability_ids: readonly string[];
  readonly at: string;
}

export type ProjectReachConsentSelection = { readonly project_id: string } | { readonly install_id: string };

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
  consent(consentId: string): PluginConsentRecord | null;
  /**
   * Takes one agreement back: writes `revoked_at` on the row and answers it, or answers null when no row has that id. Revoking a row that
   * is already revoked changes nothing (the first time stays). Only this call writes `revoked_at`; a revoked row is never deleted, and a
   * host build's agreement is not written again after it (`record`).
   */
  revoke(consentId: string, at: string): PluginConsentRecord | null;
  /** Atomically withdraw the previous approval and record the current signed declaration set. Exact repeats are idempotent. */
  grantProjectReach(entry: ProjectReachConsentEntry): PluginConsentRecord;
  /** Remove active project authorization, retaining the history, after project deletion or Home installation removal. */
  revokeProjectReach(selection: ProjectReachConsentSelection, at: string): number;
  /** The publishers pinned, revoked ones included. */
  publishers(): PluginPublisherPin[];
  pinPublisher(pin: Omit<PluginPublisherPin, "revoked_at">): PluginPublisherPin;
  /**
   * Takes a publisher back: writes `revoked_at` on its pin and answers it, or answers null when no publisher has that key. Taking back
   * one already taken back changes nothing (the first time stays). A revoked pin is never deleted and `pinPublisher` never lifts it.
   */
  revokePublisher(keyId: string, at: string): PluginPublisherPin | null;
}

const key = (row: { plugin_id: string; publisher_signature: string; kind: string; subject: string }) =>
  JSON.stringify([row.plugin_id, row.publisher_signature, row.kind, row.subject]);

function approvedIds(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((id, index) => typeof id !== "string" || !id || (index > 0 && value[index - 1] >= id))) {
    throw pluginErrors.state_invalid("项目同意的动作集合必须是已排序、去重的动作 id");
  }
  return [...value];
}

export function readProjectReachSubject(subject: string): { project_id: string; install_id: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(subject); } catch { throw pluginErrors.state_invalid("项目同意的主体无效"); }
  if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some(id => typeof id !== "string" || !id)
    || JSON.stringify(parsed) !== subject) throw pluginErrors.state_invalid("项目同意的主体无效");
  return { project_id: parsed[0], install_id: parsed[1] };
}

const copyConsent = (row: PluginConsentRecord): PluginConsentRecord => row.kind === "project_reach"
  ? { ...row, approved_capability_ids: [...row.approved_capability_ids] } : { ...row };

function projectReachRow(entry: ProjectReachConsentEntry): PluginConsentRecord {
  const subject = consentSubject.projectReach(entry.project_id, entry.install_id);
  readProjectReachSubject(subject);
  return { consent_id: randomUUID(), plugin_id: entry.plugin_id, publisher_signature: entry.publisher_signature, subject,
    manifest_digest: entry.manifest_digest, kind: "project_reach", approved_capability_ids: approvedIds(entry.approved_capability_ids),
    granted_at: entry.at, granted_by: "user", revoked_at: null };
}

const sameApproval = (a: PluginConsentRecord, b: PluginConsentRecord): boolean => key(a) === key(b) && a.revoked_at === null
  && a.manifest_digest === b.manifest_digest && JSON.stringify(a.approved_capability_ids) === JSON.stringify(b.approved_capability_ids);
const selectedReach = (row: PluginConsentRecord, selection: ProjectReachConsentSelection): boolean => {
  if (row.kind !== "project_reach" || row.revoked_at !== null) return false;
  const subject = readProjectReachSubject(row.subject);
  return "project_id" in selection ? subject.project_id === selection.project_id : subject.install_id === selection.install_id;
};

function newRows(entry: PluginConsentEntry, existing: readonly PluginConsentRecord[]): PluginConsentRecord[] {
  const rows: PluginConsentRecord[] = [];
  for (const grant of entry.grants) {
    if (!["always_on", "default_wiring", "default_group", "local_directory"].includes(grant.kind)) {
      throw pluginErrors.state_invalid("项目同意必须由项目设置单独记录");
    }
    const same = existing.filter(row => key(row) === key({ ...entry, ...grant }));
    if (same.some(row => row.revoked_at === null) || (entry.granted_by === "host_build" && same.length > 0)) continue;
    if (rows.some(row => key(row) === key({ ...entry, ...grant }))) continue;
    rows.push({ consent_id: randomUUID(), plugin_id: entry.plugin_id, publisher_signature: entry.publisher_signature, kind: grant.kind, subject: grant.subject,
      manifest_digest: entry.manifest_digest, granted_at: entry.at, granted_by: entry.granted_by, revoked_at: null, approved_capability_ids: null });
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
    return written.map(copyConsent);
  }
  consents(pluginId: string): PluginConsentRecord[] { return this.rows.filter(row => row.plugin_id === pluginId).map(copyConsent); }
  consent(consentId: string): PluginConsentRecord | null {
    const row = this.rows.find(item => item.consent_id === consentId);
    return row ? copyConsent(row) : null;
  }
  revoke(consentId: string, at: string): PluginConsentRecord | null {
    const index = this.rows.findIndex(row => row.consent_id === consentId);
    if (index < 0) return null;
    this.rows[index] = { ...this.rows[index]!, revoked_at: this.rows[index]!.revoked_at ?? at };
    return copyConsent(this.rows[index]!);
  }
  grantProjectReach(entry: ProjectReachConsentEntry): PluginConsentRecord {
    const row = projectReachRow(entry), current = this.rows.find(item => key(item) === key(row) && item.revoked_at === null);
    if (current && sameApproval(current, row)) return copyConsent(current);
    if (current) this.revoke(current.consent_id, entry.at);
    this.rows.push(row);
    return copyConsent(row);
  }
  revokeProjectReach(selection: ProjectReachConsentSelection, at: string): number {
    const rows = this.rows.filter(row => selectedReach(row, selection));
    for (const row of rows) this.revoke(row.consent_id, at);
    return rows.length;
  }
  publishers(): PluginPublisherPin[] { return [...this.pins.values()].map(pin => ({ ...pin })); }
  pinPublisher(pin: Omit<PluginPublisherPin, "revoked_at">): PluginPublisherPin {
    const pinned = this.pins.get(pin.key_id) ?? { ...pin, revoked_at: null };
    this.pins.set(pin.key_id, pinned);
    return { ...pinned };
  }
  revokePublisher(keyId: string, at: string): PluginPublisherPin | null {
    const pin = this.pins.get(keyId);
    if (!pin) return null;
    this.pins.set(keyId, { ...pin, revoked_at: pin.revoked_at ?? at });
    return { ...this.pins.get(keyId)! };
  }
}

interface ConsentRow { consent_id: string; plugin_id: string; publisher_signature: string; kind: PluginConsentRecord["kind"]; subject: string; manifest_digest: string;
  granted_at: string; granted_by: PluginConsentGranter; revoked_at: string | null; approved_capability_ids: string | null }

function consentFromRow(row: ConsentRow): PluginConsentRecord {
  if (row.kind === "project_reach") {
    readProjectReachSubject(row.subject);
    if (row.granted_by !== "user" || typeof row.approved_capability_ids !== "string") throw pluginErrors.state_invalid("项目同意缺少本人的批准集合");
    return { ...row, kind: "project_reach", granted_by: "user", approved_capability_ids: approvedIds(JSON.parse(row.approved_capability_ids)) };
  }
  if (row.approved_capability_ids !== null) throw pluginErrors.state_invalid("非项目同意的批准集合必须为 null");
  return { ...row, kind: row.kind, approved_capability_ids: null };
}

/** The ledger in the Home Runtime store (`PLUGIN_TRUST_SCHEMA_SQL`). */
export class SqlitePluginConsentLedger implements PluginConsentLedger {
  constructor(private readonly db: PluginRuntimeDatabase & { readonly isTransaction?: boolean }) {}
  record(entry: PluginConsentEntry): PluginConsentRecord[] {
    const written = (): PluginConsentRecord[] => {
      const rows = newRows(entry, this.consents(entry.plugin_id));
      for (const row of rows) this.insert(row);
      return rows;
    };
    return this.transaction(written);
  }
  private insert(row: PluginConsentRecord): void {
    this.db.prepare(`INSERT INTO plugin_consents (consent_id, plugin_id, publisher_signature, kind, subject, manifest_digest, granted_at, granted_by, revoked_at, approved_capability_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`).run(row.consent_id, row.plugin_id, row.publisher_signature, row.kind, row.subject,
      row.manifest_digest, row.granted_at, row.granted_by, row.approved_capability_ids === null ? null : JSON.stringify(row.approved_capability_ids));
  }
  private transaction<T>(written: () => T): T {
    // One transaction so the check and the writes see the same rows, unless the caller already holds one.
    if (this.db.isTransaction === true) return written();
    this.db.exec("BEGIN IMMEDIATE");
    try { const rows = written(); this.db.exec("COMMIT"); return rows; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  consents(pluginId: string): PluginConsentRecord[] {
    return (this.db.prepare("SELECT * FROM plugin_consents WHERE plugin_id = ? ORDER BY rowid").all(pluginId) as ConsentRow[]).map(consentFromRow);
  }
  consent(consentId: string): PluginConsentRecord | null {
    const row = this.db.prepare("SELECT * FROM plugin_consents WHERE consent_id = ?").get(consentId) as ConsentRow | undefined;
    return row ? consentFromRow(row) : null;
  }
  revoke(consentId: string, at: string): PluginConsentRecord | null {
    this.db.prepare("UPDATE plugin_consents SET revoked_at = ? WHERE consent_id = ? AND revoked_at IS NULL").run(at, consentId);
    return this.consent(consentId);
  }
  grantProjectReach(entry: ProjectReachConsentEntry): PluginConsentRecord {
    const row = projectReachRow(entry);
    return this.transaction(() => {
      const current = this.consents(entry.plugin_id).find(item => key(item) === key(row) && item.revoked_at === null);
      if (current && sameApproval(current, row)) return current;
      if (current) this.revoke(current.consent_id, entry.at);
      this.insert(row);
      return copyConsent(row);
    });
  }
  revokeProjectReach(selection: ProjectReachConsentSelection, at: string): number {
    return this.transaction(() => {
      const rows = (this.db.prepare("SELECT * FROM plugin_consents WHERE kind = 'project_reach' AND revoked_at IS NULL").all() as ConsentRow[])
        .map(consentFromRow).filter(row => selectedReach(row, selection));
      for (const row of rows) this.revoke(row.consent_id, at);
      return rows.length;
    });
  }
  publishers(): PluginPublisherPin[] {
    return (this.db.prepare("SELECT * FROM plugin_publishers ORDER BY rowid").all() as PluginPublisherPin[]).map(row => ({ ...row }));
  }
  pinPublisher(pin: Omit<PluginPublisherPin, "revoked_at">): PluginPublisherPin {
    this.db.prepare(`INSERT INTO plugin_publishers (key_id, public_key_spki_base64, label, pinned_at, pinned_by, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT (key_id) DO NOTHING`).run(pin.key_id, pin.public_key_spki_base64, pin.label, pin.pinned_at, pin.pinned_by);
    return { ...(this.db.prepare("SELECT * FROM plugin_publishers WHERE key_id = ?").get(pin.key_id) as PluginPublisherPin) };
  }
  revokePublisher(keyId: string, at: string): PluginPublisherPin | null {
    this.db.prepare("UPDATE plugin_publishers SET revoked_at = ? WHERE key_id = ? AND revoked_at IS NULL").run(at, keyId);
    const row = this.db.prepare("SELECT * FROM plugin_publishers WHERE key_id = ?").get(keyId) as PluginPublisherPin | undefined;
    return row ? { ...row } : null;
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
