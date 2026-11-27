import { rollbackPreservingError, type openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { SettingSnapshot, SettingsOwnerScope, SettingsRequestIdentity, SettingsTransaction, SettingsWriteReceipt } from "@molis-ai/molis-work-plugin-sdk";
import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { OverviewIndexRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { OverviewGrant } from "@molis-ai/molis-work-service-search";
import { assistantErrors } from "./assistant-errors.js";
import { DAILY_CAP_KEY, LOOKBACK_DEFAULT, LOOKBACK_KEY, OVERVIEW_GRANTS_DEFAULT, OVERVIEW_GRANTS_KEY, dailyTokenLimit, lookbackHours, overviewGrants } from "./assistant-setting-values.js";
import { defaultReportSchedule, REPORT_SCHEDULE_KEY, validateReportSchedule } from "./assistant-report-preference.js";

const names = new Map([[LOOKBACK_KEY, "lookback"], [DAILY_CAP_KEY, "daily_tokens"], [REPORT_SCHEDULE_KEY, "report_schedule"], [OVERVIEW_GRANTS_KEY, "overview_grants"]]);

export const assistantReceiptPrefix = (projectId: string | null) => "preferences/receipt/" + JSON.stringify(projectId) + "/";

/** The active preferences, their revisions and accepted requests share the Assistant's original SQLite table. */
export class AssistantSettingRecords {
  constructor(private readonly db: ReturnType<typeof openHomeSqliteDatabase>) {}

  private row(actorId: string, key: string) {
    return this.db.prepare("SELECT value, revision FROM assistant_settings WHERE actor_id=? AND key=?").get(actorId, key);
  }

  get(actorId: string, key: string): string | null {
    const row = this.row(actorId, key);
    return row ? String(row.value) : null;
  }

  set(actorId: string, key: string, value: string) {
    this.db.prepare(`INSERT INTO assistant_settings(actor_id,key,revision,value) VALUES (?, ?, 1, ?)
      ON CONFLICT(actor_id,key) DO UPDATE SET revision=assistant_settings.revision+1, value=excluded.value`).run(actorId, key, value);
  }

  /** Only the names of fields already disclosed to this work. The source rows and their values stay with their owner. */
  noteOverview(actor: string, workId: string, rows: readonly OverviewIndexRow[]): void {
    if (!rows.length) return;
    this.atomic(true, () => {
      const key = "overview/disclosed/" + workId;
      const prior = JSON.parse(this.get(actor, key) ?? "[]") as OverviewGrant[];
      const fields = new Map(prior.map(row => [row.partition_id, new Set<string>(row.fields)]));
      for (const row of rows) {
        const known = fields.get(row.partition_id) ?? new Set<string>();
        for (const name of Object.keys(row.fields)) known.add(name);
        fields.set(row.partition_id, known);
      }
      const next = JSON.stringify([...fields].map(([partition_id, names]) => ({ partition_id, fields: [...names] })));
      if (next !== JSON.stringify(prior)) this.set(actor, key, next);
    });
  }

  /** Once a field in the session stops being readable the SDK must never replay that raw prefix. */
  permitsOverviewHistory(actor: string, workId: string, grants: readonly OverviewGrant[]): boolean {
    const raw = this.get(actor, "overview/disclosed/" + workId);
    if (raw === null) return true;
    const current = new Map(grants.map(row => [row.partition_id, new Set<string>(row.fields)]));
    return (JSON.parse(raw) as OverviewGrant[]).every(row => row.fields.every(field => current.get(row.partition_id)?.has(field)));
  }

  private atomic<T>(write: boolean, run: () => T): T {
    this.db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
    try { const result = run(); this.db.exec("COMMIT"); return result; }
    catch (error) { rollbackPreservingError(error, () => this.db.exec("ROLLBACK")); throw error; }
  }

  read(actor: string, keys: readonly string[]) {
    return this.atomic(false, () => keys.map(key => this.snapshot(actor, key)));
  }

  private snapshot(actor: string, key: string): SettingSnapshot {
    const name = names.get(key);
    if (!name) throw assistantErrors.setting_invalid("助理没有声明这项偏好");
    const row = this.row(actor, name), revision = String(row?.revision ?? 0);
    const observed = { key, revision, layer_revisions: { personal: revision } };
    const fallback = key === REPORT_SCHEDULE_KEY ? defaultReportSchedule() : key === LOOKBACK_KEY ? LOOKBACK_DEFAULT : key === OVERVIEW_GRANTS_KEY ? OVERVIEW_GRANTS_DEFAULT : 0;
    if (!row || this.get(actor, "inherited/" + name) === revision) return { ...observed, state: "ok", layers: { provider_default: fallback } };
    try {
      const value: SandboxJson = key === DAILY_CAP_KEY ? dailyTokenLimit(row.value) ?? 0 : JSON.parse(String(row.value));
      if (key === LOOKBACK_KEY) lookbackHours(value);
      if (key === REPORT_SCHEDULE_KEY) validateReportSchedule(value);
      if (key === OVERVIEW_GRANTS_KEY) overviewGrants(value);
      return { ...observed, state: "ok", layers: { provider_default: fallback, personal: value } };
    } catch { return { key, revision, state: "unavailable", reason: "助理保存的偏好无法读取" }; }
  }

  transaction<R>(scope: SettingsOwnerScope, run: (tx: SettingsTransaction) => R): R {
    const actor = scope.actor_id;
    const receiptKey = ({ key, layer, request_id }: SettingsRequestIdentity) => assistantReceiptPrefix(scope.project_id) + JSON.stringify([key, layer, request_id]);
    return this.atomic(true, () => run({
      readCurrent: key => {
        const current = this.snapshot(actor, key);
        if (current.state === "unavailable") throw assistantErrors.state(current.reason);
        return current;
      },
      readReceipt: identity => { const raw = this.get(actor, receiptKey(identity)); return raw ? JSON.parse(raw) as SettingsWriteReceipt : undefined; },
      writeChange: ({ key, change }) => {
        const name = names.get(key);
        if (!name) throw assistantErrors.setting_invalid("助理没有声明这项偏好");
        const value = "set" in change ? change.set : null;
        let encoded: string;
        if (key === REPORT_SCHEDULE_KEY) {
          if ("set" in change) validateReportSchedule(value);
          encoded = JSON.stringify(value ?? defaultReportSchedule());
        } else if (key === OVERVIEW_GRANTS_KEY) {
          if ("set" in change) overviewGrants(value);
          encoded = JSON.stringify(value ?? OVERVIEW_GRANTS_DEFAULT);
        } else if (key === LOOKBACK_KEY) {
          if ("set" in change) lookbackHours(value);
          encoded = JSON.stringify(value ?? LOOKBACK_DEFAULT);
        } else {
          if ("set" in change && typeof value !== "number") throw assistantErrors.setting_invalid("每日用量上限需要整数");
          encoded = String(dailyTokenLimit(value === 0 ? null : value) ?? "");
        }
        this.set(actor, name, encoded);
        if ("inherit" in change) this.set(actor, "inherited/" + name, String(this.row(actor, name)!.revision));
      },
      saveReceipt: (identity, receipt) => this.set(actor, receiptKey(identity), JSON.stringify(receipt)),
    }));
  }
}
