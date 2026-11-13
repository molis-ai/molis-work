import { printCliJson, printCliLine } from "@molis-ai/molis-work-app-cli";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { acquireStorageOwner, readStorageSpace } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { adoptProjectDatabase, retireFilesConsents, type ProjectAdoptionReport } from "./process-items-adoption.js";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { createHomeSnapshot } from "./home-snapshot.js";
import { homeSnapshotErrors } from "./home-store-snapshot.js";
import { recoverHomeRestore, restoreHomeSnapshot } from "./home-restore.js";
import type { HomeRestoreCatalogInspector, HomeRestoreResult } from "./home-restore-contract.js";
import { homeRestoreErrors } from "./home-restore-input.js";
import { readRollbackPoint, rollbackHome, type RollbackResult } from "./installer/home-rollback.js";
import { resolveConfiguredHome } from "./product-home.js";

const usage = "molis-work home snapshot --to DIRECTORY [--home PATH] [--json]\n"
  + "molis-work home adopt-process-items --confirm [--home PATH] [--json]\n"
  + "molis-work home restore --from DIRECTORY [--home PATH] [--json]\n"
  + "molis-work home restore --recover [--home PATH] [--json]\n"
  + "molis-work home rollback --check | --confirm [--save-current DIRECTORY] [--home PATH] [--json]\n\n"
  + "停止使用该 Home 的宿主与所有写入者后，在原 Home 的离线窗口操作。快照目标必须是 Home 外尚不存在的目录；原密钥不会导出。恢复限原 Home 路径，预检通过后完整替换业务集合并保留私有原件。未完成恢复会阻断正常启动，先用 --recover 回滚或收尾。"
  + "回到上一版：--check 只看能不能回；--confirm 把这一版升级过的库放回升级前的样子、换回上一版程序，--save-current 先把现在的 Home 整份存到给出的目录。";

const ALLOWED = { snapshot: ["--home", "--to", "--json"], restore: ["--home", "--from", "--recover", "--json"],
  "adopt-process-items": ["--home", "--confirm", "--json"],
  rollback: ["--home", "--check", "--confirm", "--save-current", "--json"] } as const;
const SWITCHES = new Set(["--json", "--recover", "--check", "--confirm"]);

function flags(args: string[], operation: keyof typeof ALLOWED): Map<string, string | true> {
  const allowed: readonly string[] = ALLOWED[operation];
  const values = new Map<string, string | true>();
  for (let at = 1; at < args.length; at += 1) {
    const name = args[at]!;
    if (!allowed.includes(name) || values.has(name)) throw homeSnapshotErrors.invalid(`未知或重复的参数: ${name}`);
    if (SWITCHES.has(name)) values.set(name, true);
    else {
      const value = args[++at];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--"))
        throw homeSnapshotErrors.invalid(`${name} 必须给出非空路径`);
      values.set(name, value);
    }
  }
  return values;
}

function rolledBackMessage(result: RollbackResult): string {
  const data = result.data === "unchanged" ? "这一版没有升级过数据，数据照旧。" : `放回了升级前的 ${result.restored.length} 份数据。`;
  return `已回到 ${result.version}。${data}${result.saved_to ? `\n回去之前的 Home 存在：${result.saved_to}` : ""}\n重新打开 Molis Work 即可；之后的自动更新会先停在这一版，到设置里的「更新」再换回新版。`;
}

function restoredMessage(result: HomeRestoreResult): string {
  if (result.status === "unchanged") return "Home 已与快照一致，未写入业务内容。";
  if (result.status === "no_recovery") return "没有待恢复的离线操作。";
  const action = result.status === "restored" ? "恢复已完成" : result.status === "rolled_back" ? "已回到操作前的状态" : "已完成已提交恢复的收尾";
  return action + "。\n原件与失败材料保留在：" + result.originals_directory;
}

/** Closed arguments fail before acquiring a Home. The restore inspector comes only from product platform composition. */
export async function runLocalHomeCli(args: string[], inspectCatalog?: HomeRestoreCatalogInspector): Promise<number> {
  if (!args.length || args[0] === "--help" || args[0] === "-h" || ["snapshot", "restore", "adopt-process-items", "rollback"].includes(args[0]!) && args.length === 2 && args[1] === "--help") {
    printCliLine(usage); return 0;
  }
  const operation = args[0];
  if (operation !== "snapshot" && operation !== "restore" && operation !== "adopt-process-items" && operation !== "rollback") throw homeSnapshotErrors.invalid(`未知 Home 操作: ${operation}`);
  const values = flags(args, operation), home = values.get("--home"), destination = values.get("--to"), source = values.get("--from");
  if (operation === "snapshot" && typeof destination !== "string") throw homeSnapshotErrors.invalid("home snapshot 必须给出 --to 目录");
  if (operation === "restore" && (typeof source === "string") === values.has("--recover")) throw homeRestoreErrors.invalid("home restore 必须且只能选择 --from 目录或 --recover");
  if (operation === "rollback" && values.has("--check") === values.has("--confirm")) throw homeSnapshotErrors.invalid("home rollback 必须且只能选择 --check 或 --confirm");
  if (operation === "rollback" && values.has("--check") && values.has("--save-current")) throw homeSnapshotErrors.invalid("--save-current 只和 --confirm 一起用");
  if (operation === "adopt-process-items" && !values.has("--confirm")) throw homeSnapshotErrors.invalid("home adopt-process-items 必须带 --confirm，且只在停止宿主后的维护窗口执行");
  if (operation === "restore" && !inspectCatalog) throw homeRestoreErrors.dependency_unavailable("此入口没有产品目录库的只读检查端口，未开始恢复");
  const abort = new AbortController(), cancelled = () => abort.abort(new Error("Home 离线操作已取消"));
  process.once("SIGINT", cancelled); process.once("SIGTERM", cancelled);
  try {
    const options = { ...(typeof home === "string" ? { homeDirectory: home } : {}), signal: abort.signal };
    if (operation === "adopt-process-items") {
      const target = resolveConfiguredHome(typeof home === "string" ? home : undefined);
      const owner = acquireStorageOwner(agentRuntimeDirectory(target));
      try {
        const space = readStorageSpace(target);
        if (!space) throw new ActionError("actions.missing", "这个 Home 还没有账号空间");
        const backupDirectory = `${target}/sync/process-items-adoption-backups/${new Date().toISOString().replaceAll(":", "-")}`;
        const reports: ProjectAdoptionReport[] = [];
        for (const relative of projectDatabases(target, space)) {
          const projectId = relative.split("/").at(-2)!;
          reports.push(adoptProjectDatabase({ home: target, owner, projectId, backupDirectory }));
        }
        if (reports.some(report => report.state === "refused")) {
          if (values.has("--json")) printCliJson({ reports, completed: false, consents: null });
          else printCliLine(`有 ${reports.filter(report => report.state === "refused").length} 个项目没有采用，未撤 Files 同意；报告里是原因。`);
          return 1;
        }
        const consents = retireFilesConsents({ home: target, owner, at: new Date().toISOString() });
        if (values.has("--json")) printCliJson({ reports, completed: true, consents });
        else printCliLine(`采用完成：${reports.length} 个项目，撤 Files 同意 ${consents.revoked} 条，移出项目成员 ${consents.memberships} 个。`);
        return 0;
      } finally { owner.release(); }
    }
    if (operation === "rollback") {
      const target = resolveConfiguredHome(typeof home === "string" ? home : undefined);
      if (values.has("--check")) {
        const point = readRollbackPoint(target);
        if (values.has("--json")) printCliJson(point);
        else printCliLine(point.available ? `可以回到 ${point.version}${point.data === "restore" ? "，会放回升级前的数据" : "，数据照旧"}。` : `现在回不了上一版（${point.reason}）。`);
        return 0;
      }
      const save = values.get("--save-current");
      // Asked first so a refusal does not leave a whole copy of the Home behind; the rollback asks again under the lock.
      if (typeof save === "string" && !readRollbackPoint(target).available) await rollbackHome(target);
      const saved = typeof save === "string" ? (await createHomeSnapshot({ ...options, destination: save })).snapshot_directory : null;
      const result = await rollbackHome(target, { saved_to: saved });
      if (values.has("--json")) printCliJson(result); else printCliLine(rolledBackMessage(result));
    } else if (operation === "snapshot") {
      const result = await createHomeSnapshot({ ...options, destination: destination as string });
      if (values.has("--json")) printCliJson(result);
      else printCliLine(`快照已保存：${result.snapshot_directory}\n${result.stores} 项登记，${result.databases} 个实际 SQLite 库。原密钥不在快照内，请保留同 Home 原依赖。`);
    } else {
      const result = values.has("--recover") ? await recoverHomeRestore({ ...options, inspectCatalog: inspectCatalog! })
        : await restoreHomeSnapshot({ ...options, source: source as string, inspectCatalog: inspectCatalog! });
      if (values.has("--json")) printCliJson(result); else printCliLine(restoredMessage(result));
    }
    return 0;
  } catch (error) {
    if (!values.has("--json") || !(error instanceof ActionError)) throw error;
    process.stderr.write(
      JSON.stringify({ error: { code: error.code, kind: error.kind, message: error.message } }) +
        "\n",
    );
    return 1;
  } finally {
    process.off("SIGINT", cancelled);
    process.off("SIGTERM", cancelled);
  }
}
