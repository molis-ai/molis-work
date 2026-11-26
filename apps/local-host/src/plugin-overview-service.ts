import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  OVERVIEW_KINDS, OVERVIEW_MAIN_TABLE, OVERVIEW_ROW_LIMIT, type OverviewKind, type PluginInstanceRecord, type PluginManifest, type PluginOverviewClient,
  type PluginOverviewRows, type PluginProjectDatabase, type PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { overviewColumns } from "@molis-ai/molis-work-plugin-sdk";
import { joinPluginTransaction } from "./plugin-transaction.js";

interface Statement { get(...parameters: unknown[]): unknown; run(...parameters: unknown[]): unknown }
interface Connection { prepare(sql: string): Statement }

/**
 * `services.overview` (specs/unified-partition-plugins §6.1「主库摘要表」, V17, batch 108): the overview rows of a plugin that keeps its data in
 * the partition's main database. They go into the platform's `plugin_overview_rows` there, on the Host's own connection, inside the plugin's
 * current transaction (`joinPluginTransaction`), so a row changes with the business write it sums up or not at all. The installation column is
 * the platform's stamp from the instance's record; the plugin names neither it nor the partition, reaches only its own rows, and writes only
 * the kinds its Manifest declares. After the commit the partition's overview is read again (`changed`), read-only and waking nothing.
 */
export function pluginOverviewFor(manifest: PluginManifest, context: PluginStartContext, database: PluginProjectDatabase | undefined,
  connection: object | undefined, assertActive: () => void, record: () => PluginInstanceRecord | null, changed: (installId: string) => void): PluginOverviewClient | undefined {
  const kinds = manifest.overview_projection?.kinds ?? [];
  if (!kinds.length || !manifest.databases?.project || manifest.databases.partition || !database || !connection || !("prepare" in connection)) return undefined;
  const db = connection as Connection, declared = new Set<string>(kinds);
  const installation = () => {
    assertActive();
    const current = record();
    if (!current || current.install_id !== context.install_id || current.plugin_id !== manifest.plugin_id || current.state !== "running") {
      throw new ActionError("actions.forbidden", "所属安装已停止");
    }
    return current.install_id;
  };
  const kindOf = (kind: unknown): OverviewKind => {
    if (!(OVERVIEW_KINDS as readonly unknown[]).includes(kind)) throw new ActionError("actions.input_invalid", `${String(kind)} 不是平台的总览种类`);
    if (!declared.has(kind as string)) throw new ActionError("actions.forbidden", `插件没有在 overview_projection 里声明 ${String(kind)}`);
    return kind as OverviewKind;
  };
  return Object.freeze<PluginOverviewClient>({
    join: (transaction, write) => joinPluginTransaction(database, transaction, (afterCommit, live) => {
      live();
      const install = installation();
      let touched = false;
      const touch = () => {
        live(); installation();
        if (!touched) { touched = true; afterCommit(() => changed(install)); }
      };
      const rows: PluginOverviewRows = {
        upsert(kind, row) {
          const checkedKind = kindOf(kind);
          touch();
          const values = overviewColumns(checkedKind, row);
          const found = db.prepare(`SELECT 1 AS found FROM ${OVERVIEW_MAIN_TABLE} WHERE install_id = ? AND kind = ? AND row_id = ?`).get(install, checkedKind, values.row_id);
          if (!found) {
            const total = Number((db.prepare(`SELECT count(*) AS total FROM ${OVERVIEW_MAIN_TABLE} WHERE install_id = ? AND kind = ?`).get(install, checkedKind) as { total: number }).total);
            if (total >= OVERVIEW_ROW_LIMIT) throw new ActionError("actions.input_invalid", `总览表的 ${checkedKind} 至多 ${OVERVIEW_ROW_LIMIT} 行，先删掉不再需要的行`);
          }
          const columns = ["install_id", ...Object.keys(values)];
          db.prepare(`INSERT INTO ${OVERVIEW_MAIN_TABLE} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
            ON CONFLICT (install_id, kind, row_id) DO UPDATE SET ${Object.keys(values).filter(column => column !== "kind" && column !== "row_id").map(column => `${column} = excluded.${column}`).join(", ")}`)
            .run(install, ...Object.values(values));
        },
        remove(kind, rowId) {
          const checkedKind = kindOf(kind);
          touch();
          db.prepare(`DELETE FROM ${OVERVIEW_MAIN_TABLE} WHERE install_id = ? AND kind = ? AND row_id = ?`).run(install, checkedKind, rowId);
        },
        removePrefix(kind, prefix) {
          const checkedKind = kindOf(kind);
          if (!prefix) throw new ActionError("actions.input_invalid", "前缀不能为空");
          touch();
          db.prepare(`DELETE FROM ${OVERVIEW_MAIN_TABLE} WHERE install_id = ? AND kind = ? AND substr(row_id, 1, ?) = ?`).run(install, checkedKind, prefix.length, prefix);
        },
      };
      return write(Object.freeze(rows));
    }),
  });
}

/** The platform's part of removing an installation from a partition's main database: its overview rows go with it, whatever happens to its data. */
export function forgetMainOverviewRows(db: Connection, installId: string): void {
  db.prepare(`DELETE FROM ${OVERVIEW_MAIN_TABLE} WHERE install_id = ?`).run(installId);
}
