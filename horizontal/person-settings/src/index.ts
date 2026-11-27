import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { PERSON_SETTING_LIMITS, type PersonSettingDeclaration, type PluginPersonSettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PersonSettingRecord } from "@molis-ai/molis-work-contracts/services/person-settings";
import { assertPortableConfig, openBaselineHomeSqlite, personalConfigJournal, personalConfigRecord, personalConfigReplica, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

export type { PersonSettingRecord };

/**
 * Settings that follow the person, not a partition (specs/unified-partition-plugins §4.2 第 4 条, batch 106): kept in the Home per
 * (installation, key), given only to the person on this machine and to the plugin's own background, never to an Agent, an MCP client, a
 * workflow, another plugin or (later) another member (S-person-settings-private). A key the plugin declared `portable` (only a
 * `preference` may be) follows the person to their other devices through the personal configuration sync of #2231
 * (`personalConfigReplica`, whose `assertPortableConfig` refuses a path or a secret in the value as well); every other key stays here.
 */
export const PERSON_SETTINGS_STORE = "person-settings";
/** The sync journal's namespace: the portable keys only. */
export const PERSON_SETTINGS_JOURNAL = "person_settings";
// Synced by plugin, not installation: another device has its own installation of the same plugin (install ids are per Home).
const journal = personalConfigJournal(PERSON_SETTINGS_JOURNAL, "person_settings", row => `${row}.plugin_id || '/' || ${row}.key`, row => `${row}.portable = 1`);

export const PERSON_SETTINGS_BASELINE: SqliteBaseline = { version: /* @version database.person_settings_baseline */ 1, schema: `
CREATE TABLE person_settings (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'secret_ref', 'connection_ref', 'local_path')),
  portable INTEGER NOT NULL CHECK (portable IN (0, 1) AND (portable = 0 OR kind = 'preference')),
  value_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (install_id, key)
);
` + journal.schema };
export const PERSON_SETTINGS_HOME_STORE = { path: PERSON_SETTINGS_STORE, library: { baseline: PERSON_SETTINGS_BASELINE } } as const satisfies HomeStoreDeclaration;

type Database = ReturnType<typeof openBaselineHomeSqlite>;

export function openPersonSettings(home: string, options: { now?: () => Date } = {}): PersonSettingsStore {
  return new PersonSettingsStore(openBaselineHomeSqlite(home, PERSON_SETTINGS_STORE, PERSON_SETTINGS_BASELINE), options.now ?? (() => new Date()));
}

/** The caller fields checked before reading or writing an installation's person settings. */
export type PersonSettingsCaller = Pick<ActionCallContext, "actor_id" | "audience" | "actor_kind" | "delegated_by" | "host_plugin" | "plugin_install_id" | "calling_plugin_id">;

/**
 * Whether this call may reach an installation's person settings: the person on this machine (a page or a management command, not a
 * runtime acting for them, not a plugin call and not a delegated call), or the installation's own background job (not a consumed-action
 * call with `host_plugin` or `actor_kind: "user"`). Agents, MCP clients, workflows, other plugins and other members are refused, whatever
 * they were granted (S-person-settings-private).
 */
export function assertPersonSettingsCaller(caller: PersonSettingsCaller, installId: string): void {
  const person = caller.actor_id === LOCAL_PERSON_ACTOR_ID && caller.audience === "user" && caller.actor_kind !== "runtime"
    && caller.delegated_by === undefined && !caller.host_plugin && !caller.calling_plugin_id;
  const ownBackground = caller.actor_id === LOCAL_PERSON_ACTOR_ID && caller.audience === "plugin" && caller.actor_kind !== "user"
    && caller.plugin_install_id === installId && caller.delegated_by === undefined && !caller.host_plugin && !caller.calling_plugin_id;
  if (!person && !ownBackground) throw new ActionError("actions.forbidden", "本人的设置只给本人和这个插件自己的后台工作");
}

/** Whose settings: the installation and its plugin, both the Host's stamp from the trusted context. */
export interface PersonSettingsOwner {
  readonly install_id: string;
  readonly plugin_id: string;
}

export class PersonSettingsStore {
  constructor(readonly db: Database, private readonly now: () => Date) {}

  /** The declared key's value for this installation, or null when it has none. */
  get(caller: PersonSettingsCaller, installId: string, declarations: PluginPersonSettingsDeclaration | undefined, key: string): PersonSettingRecord | null {
    assertPersonSettingsCaller(caller, installId);
    declared(declarations, key);
    const row = this.db.prepare("SELECT key, kind, portable, value_json, revision, updated_at FROM person_settings WHERE install_id = ? AND key = ?").get(installId, key);
    return row ? record(row) : null;
  }

  list(caller: PersonSettingsCaller, installId: string): PersonSettingRecord[] {
    assertPersonSettingsCaller(caller, installId);
    return this.db.prepare("SELECT key, kind, portable, value_json, revision, updated_at FROM person_settings WHERE install_id = ? ORDER BY key").all(installId).map(record);
  }

  /**
   * Writes a declared key. With `expected_revision` the write is refused when the stored one differs (`actions.conflict`), so two
   * pages do not overwrite each other. A portable value is checked the way sync checks it before it is kept.
   */
  set(caller: PersonSettingsCaller, owner: PersonSettingsOwner, declarations: PluginPersonSettingsDeclaration | undefined, key: string, value: unknown, options: { expected_revision?: number | null } = {}): PersonSettingRecord {
    return this.setMany(caller, owner, declarations, [{ key, value, ...options }])[0]!;
  }

  setMany(caller: PersonSettingsCaller, owner: PersonSettingsOwner, declarations: PluginPersonSettingsDeclaration | undefined,
    changes: readonly { key: string; value: unknown; expected_revision?: number | null }[]): PersonSettingRecord[] {
    assertPersonSettingsCaller(caller, owner.install_id);
    if (new Set(changes.map(item => item.key)).size !== changes.length) throw new ActionError("actions.input_invalid", "设置键重复");
    return this.write(() => changes.map(({ key, value, expected_revision }) => this.setOne(caller, owner, declarations, key, value, expected_revision)));
  }

  private setOne(caller: PersonSettingsCaller, owner: PersonSettingsOwner, declarations: PluginPersonSettingsDeclaration | undefined, key: string,
    value: unknown, expectedRevision?: number | null): PersonSettingRecord {
    const installId = owner.install_id;
    assertPersonSettingsCaller(caller, installId);
    const declaration = declared(declarations, key);
    if (declaration.portable && declaration.kind !== "preference") {
      throw new ActionError("actions.input_invalid", "只有 preference 类型的本人设置才能标为 portable");
    }
    const json = JSON.stringify(value);
    if (json === undefined || Buffer.byteLength(json) > PERSON_SETTING_LIMITS.value_bytes) throw new ActionError("actions.input_invalid", `设置的值要能写成 JSON，且不超过 ${PERSON_SETTING_LIMITS.value_bytes} 字节`);
    if (declaration.portable) assertPortableConfig(value, PERSON_SETTING_LIMITS.value_bytes);
    const current = this.db.prepare("SELECT revision FROM person_settings WHERE install_id = ? AND key = ?").get(installId, key) as { revision: number } | undefined;
    if (expectedRevision !== undefined && (current?.revision ?? null) !== expectedRevision) throw new ActionError("actions.conflict", "这项设置刚被改过，重新打开再改");
    const revision = (current?.revision ?? 0) + 1;
    this.db.prepare(`INSERT INTO person_settings (install_id, plugin_id, key, kind, portable, value_json, revision, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (install_id, key) DO UPDATE SET kind = excluded.kind, portable = excluded.portable, value_json = excluded.value_json, revision = excluded.revision, updated_at = excluded.updated_at`)
      .run(installId, owner.plugin_id, key, declaration.kind, declaration.portable ? 1 : 0, json, revision, this.now().toISOString());
    return this.get(caller, installId, declarations, key)!;
  }

  remove(caller: PersonSettingsCaller, installId: string, declarations: PluginPersonSettingsDeclaration | undefined, key: string): boolean {
    assertPersonSettingsCaller(caller, installId);
    declared(declarations, key);
    return Number(this.db.prepare("DELETE FROM person_settings WHERE install_id = ? AND key = ?").run(installId, key).changes) > 0;
  }

  /** Every key of an installation, when it is uninstalled. A portable key's removal is synced like any other change. */
  clearInstall(installId: string): number {
    return Number(this.db.prepare("DELETE FROM person_settings WHERE install_id = ?").run(installId).changes);
  }

  close(): void { this.db.close(); }

  private write<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = run();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

/** The installation here of a plugin, with what it declares, as the Host's install table has it; null when it is not installed here. */
export type PersonSettingsInstallation = (pluginId: string) => { readonly install_id: string; readonly declarations: PluginPersonSettingsDeclaration | undefined } | null;

/**
 * The portable keys as a personal configuration replica (#2231), keyed `<plugin>/<key>`: only rows marked portable go out or come in, and an
 * incoming key must be one the plugin's installation here declares portable, so sync never writes a secret, a connection or a path, and never
 * a setting of a plugin this device does not have. It is kept under that installation.
 */
export function personSettingsConfigReplica(db: Parameters<typeof personalConfigReplica>[0], spaceId: string, authorize: () => void,
  installation: PersonSettingsInstallation, now: () => Date = () => new Date()) {
  const split = (id: string): [string, string] => {
    const at = id.lastIndexOf("/");
    if (at < 1 || at === id.length - 1) throw new ActionError("actions.input_invalid", "本人设置的同步键无效");
    return [id.slice(0, at), id.slice(at + 1)];
  };
  const portable = (id: string): { install_id: string; plugin_id: string; key: string } | null => {
    const [pluginId, key] = split(id);
    const installed = installation(pluginId);
    const declaration = installed?.declarations?.keys.find(entry => entry.key === key);
    return installed && declaration?.portable === true && declaration.kind === "preference" ? { install_id: installed.install_id, plugin_id: pluginId, key } : null;
  };
  const refused = () => new ActionError("actions.forbidden", "这项设置不随本人同步");
  return personalConfigReplica(db, PERSON_SETTINGS_JOURNAL, { spaceId, authorize }, {
    maximumBytes: PERSON_SETTING_LIMITS.value_bytes,
    key(id) { if (!portable(id)) throw refused(); },
    read(id) {
      const target = portable(id);
      if (!target) return null;
      const row = db.prepare("SELECT value_json FROM person_settings WHERE install_id = ? AND plugin_id = ? AND key = ? AND portable = 1")
        .get(target.install_id, target.plugin_id, target.key) as { value_json: string } | undefined;
      return row ? { value: JSON.parse(row.value_json) } : null;
    },
    apply(id, data) {
      const target = portable(id);
      if (!target) throw refused();
      if (data === null) {
        db.prepare("DELETE FROM person_settings WHERE install_id = ? AND plugin_id = ? AND key = ? AND portable = 1")
          .run(target.install_id, target.plugin_id, target.key);
        return;
      }
      const { value } = personalConfigRecord(data, ["value"]);
      assertPortableConfig(value, PERSON_SETTING_LIMITS.value_bytes);
      const current = db.prepare("SELECT revision FROM person_settings WHERE install_id = ? AND key = ?").get(target.install_id, target.key) as { revision: number } | undefined;
      db.prepare(`INSERT INTO person_settings (install_id, plugin_id, key, kind, portable, value_json, revision, updated_at) VALUES (?, ?, ?, 'preference', 1, ?, ?, ?)
        ON CONFLICT (install_id, key) DO UPDATE SET kind = excluded.kind, portable = excluded.portable, value_json = excluded.value_json, revision = excluded.revision, updated_at = excluded.updated_at`)
        .run(target.install_id, target.plugin_id, target.key, JSON.stringify(value), (current?.revision ?? 0) + 1, now().toISOString());
    },
    canUpload(id) { return portable(id) !== null; },
  });
}

function declared(declarations: PluginPersonSettingsDeclaration | undefined, key: string): PersonSettingDeclaration {
  const found = declarations?.keys.find(entry => entry.key === key);
  if (!found) throw new ActionError("actions.input_invalid", `插件没有声明本人设置 ${key}`);
  return found;
}
function record(row: Record<string, unknown>): PersonSettingRecord {
  return { key: String(row.key), kind: row.kind as PersonSettingRecord["kind"], portable: Number(row.portable) === 1,
    value: JSON.parse(String(row.value_json)), revision: Number(row.revision), updated_at: String(row.updated_at) };
}
