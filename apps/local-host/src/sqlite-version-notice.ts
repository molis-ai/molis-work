import { PLUGIN_STATEMENT_SQLITE_VERSION } from "@molis-ai/molis-work-plugin-runtime";
import { hostLog } from "./host-log.js";

/**
 * What the Host says at start when the SQLite that comes with its Node is not the one the plugin statement check was read
 * against (SQLD-06, specs/sqlite-driver-switch §2.1). `null` when it is the same one, so a Host on the locked Node says nothing.
 *
 * This only says it. `pluginStatementGuard` keeps refusing every statement of a Host on another SQLite, whatever is printed here.
 * The wording is true of the build as it is now: project libraries still run on the SQLite bundled with `better-sqlite3`, so
 * plugin statements are not affected yet. When the project library moves to `node:sqlite` (SQLD-d) the last two sentences
 * change with it. The Node version named is the one in the root `.nvmrc` (the repository's pin; the sentence itself does not point at it); tests/sqlite-version-notice.test.ts reads both.
 */
export function sqliteVersionNotice(running: string | undefined = process.versions.sqlite, node: string = process.version): string | null {
  if (running === PLUGIN_STATEMENT_SQLITE_VERSION) return null;
  return `提示：当前 Node（${node}）自带的 SQLite 是 ${running ?? "未知版本"}，插件语句检查审过的是 ${PLUGIN_STATEMENT_SQLITE_VERSION}。`
    + "项目库现在仍用随包的 SQLite，插件语句不受影响；等项目库改用 Node 自带的 SQLite，版本不符时会拒绝项目库里的全部插件语句。"
    + "请用 Node 24.15.0 运行。";
}

/**
 * The notice for the Host's own Node, with its entry in the Host log (area `host`, keys only) for whoever reads the log file.
 * Returns the sentence for the launcher to print beside its other start lines, or `null` when there is nothing to say.
 */
export function reportSqliteVersion(running: string | undefined = process.versions.sqlite, node: string = process.version): string | null {
  const notice = sqliteVersionNotice(running, node);
  if (notice) hostLog.warn("host", "sqlite_version_unreviewed", undefined, { sqlite: running ?? null, reviewed: PLUGIN_STATEMENT_SQLITE_VERSION, node });
  return notice;
}
