import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { DatabaseSync } from "node:sqlite";
import { OBSERVATION_PROVIDER_ID, OBSERVATION_RETENTION_MODES, type ObservationRetentionMode } from "@molis-ai/molis-work-contracts/services/observation";
import type { SettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/settings";
import { bindSettingsHandlers, defineSettingsActions, type SettingSnapshot, type SettingsOwner, type SettingsRequestIdentity } from "@molis-ai/molis-work-plugin-sdk";
import { assertPersonCaller } from "./access.js";
import { sweepExpiredRecords } from "./cleanup.js";
import { observationErrors } from "./errors.js";
import { openForManagement, type ManagementActionDeps } from "./management-actions.js";
import { readStoredSettings, preferenceLayer, writeStoredSettings } from "./management-state.js";

export const RETENTION_KEY = "observation.retention";
const SPACE_KEY = "observation.space_reminder";
export const retentionActions = defineSettingsActions({
  scope: "home",
  read: { capability_id: "observation.preferences.read", version: /* @version action.observation.preferences.read */ 1,
    title: "读取工作记录偏好", description: "读取清理期限、空间提醒及其来源与修订", permissions: [] },
  write: { capability_id: "observation.preferences.write", version: /* @version action.observation.preferences.write */ 1,
    title: "修改工作记录偏好", description: "本人按已查看的版本修改清理期限或空间提醒", permissions: [] },
});
const declaration: SettingsDeclaration = {
  entries: [{ key: RETENTION_KEY, title: { key: "workbench.scene.retention" }, summary: { key: "workbench.scene.retention-effect" },
    layers: ["personal"], schema: { type: "string", enum: [...OBSERVATION_RETENTION_MODES] }, consequence: ["reach", "schedule"] },
    { key: SPACE_KEY, title: { key: "workbench.settings-work-records.rem-row-title" }, summary: { key: "workbench.settings-work-records.rem-note-on" },
      layers: ["personal"], schema: { type: "object", required: [], additionalProperties: false,
        properties: { bytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } } } }],
  read: { capability_id: retentionActions.read.capability_id, version: retentionActions.read.version },
  write: { capability_id: retentionActions.write.capability_id, version: retentionActions.write.version },
};
export const observationSettingOwner = { provider_id: OBSERVATION_PROVIDER_ID, settings_entries: declaration };

function snapshot(db: DatabaseSync, key: string): SettingSnapshot {
  const reminder = key === SPACE_KEY;
  const layer = preferenceLayer(db, reminder ? "space-reminder" : "retention");
  const stored = readStoredSettings(db);
  const bytes = stored.space_reminder_bytes;
  const value: SandboxJson = reminder ? (bytes === null ? {} : { bytes }) : stored.retention_mode;
  return { key, state: "ok", revision: String(layer.revision), layer_revisions: { personal: String(layer.revision) }, layers: {
    provider_default: reminder ? {} : "keep", ...(layer.explicit && { personal: value }),
  } };
}

export function retentionSettingHandlers(deps: ManagementActionDeps) {
  const owner: SettingsOwner = {
    owner_id: OBSERVATION_PROVIDER_ID, errors: observationErrors,
    read(_scope, keys) {
      const opened = deps.writer.database();
      if (!opened) throw observationErrors.store_unavailable("工作记录库当前不可用");
      return keys.map(key => snapshot(opened.db, key));
    },
    transaction(scope, run) {
      const db = openForManagement(deps.writer);
      const receiptKey = ({ key, layer, request_id }: SettingsRequestIdentity) =>
        "settings.receipt:" + JSON.stringify([scope.actor_id, key, layer, request_id]);
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = run({
          readCurrent: key => snapshot(db, key),
          readReceipt(identity) {
            const row = db.prepare("SELECT value FROM writer_state WHERE key=?").get(receiptKey(identity));
            return row && JSON.parse(String(row.value));
          },
          writeChange({ key, change }) {
            if (key === SPACE_KEY) {
              // The SDK already checked the closed schema, including the integer bounds.
              const bytes = "set" in change ? (change.set as { bytes?: number }).bytes : undefined;
              writeStoredSettings(db, { ...readStoredSettings(db), space_reminder_bytes: bytes ?? null }, { "space-reminder": "set" in change });
              return;
            }
            const value = "set" in change ? change.set : "keep";
            if (!OBSERVATION_RETENTION_MODES.includes(value as ObservationRetentionMode)) throw observationErrors.setting_invalid("清理期限无效");
            writeStoredSettings(db, { ...readStoredSettings(db), retention_mode: value as ObservationRetentionMode }, { retention: "set" in change });
            sweepExpiredRecords(db, deps.env.now());
          },
          saveReceipt(identity, receipt) {
            db.prepare("INSERT INTO writer_state(key,value) VALUES (?,?)").run(receiptKey(identity), JSON.stringify(receipt));
          },
        });
        db.exec("COMMIT");
        return result;
      } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
    },
  };
  const bound = bindSettingsHandlers(retentionActions, declaration, owner);
  return { read: bound.read, write: { ...bound.write, handle(caller: Parameters<typeof bound.write.handle>[0], input: unknown) {
    assertPersonCaller(caller);
    return bound.write.handle(caller, input);
  } } };
}
