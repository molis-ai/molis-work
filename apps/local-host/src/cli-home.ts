import { printCliJson, printCliLine } from "@molis-ai/molis-work-app-cli";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHomeSnapshot } from "./home-snapshot.js";
import { homeSnapshotErrors } from "./home-store-snapshot.js";
import { recoverHomeRestore, restoreHomeSnapshot } from "./home-restore.js";
import type { HomeRestoreCatalogInspector, HomeRestoreResult } from "./home-restore-contract.js";
import { homeRestoreErrors } from "./home-restore-input.js";

const usage = "molis-work home snapshot --to DIRECTORY [--home PATH] [--json]\n"
  + "molis-work home restore --from DIRECTORY [--home PATH] [--json]\n"
  + "molis-work home restore --recover [--home PATH] [--json]\n\n"
  + "停止使用该 Home 的宿主与所有写入者后，在原 Home 的离线窗口操作。快照目标必须是 Home 外尚不存在的目录；原密钥不会导出。恢复限原 Home 路径，预检通过后完整替换业务集合并保留私有原件。未完成恢复会阻断正常启动，先用 --recover 回滚或收尾。";

function flags(args: string[], operation: "snapshot" | "restore"): Map<string, string | true> {
  const allowed = operation === "snapshot" ? ["--home", "--to", "--json"] : ["--home", "--from", "--recover", "--json"];
  const values = new Map<string, string | true>();
  for (let at = 1; at < args.length; at += 1) {
    const name = args[at]!;
    if (!allowed.includes(name) || values.has(name)) throw homeSnapshotErrors.invalid(`未知或重复的参数: ${name}`);
    if (name === "--json" || name === "--recover") values.set(name, true);
    else {
      const value = args[++at];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--"))
        throw homeSnapshotErrors.invalid(`${name} 必须给出非空路径`);
      values.set(name, value);
    }
  }
  return values;
}

function restoredMessage(result: HomeRestoreResult): string {
  if (result.status === "unchanged") return "Home 已与快照一致，未写入业务内容。";
  if (result.status === "no_recovery") return "没有待恢复的离线操作。";
  const action = result.status === "restored" ? "恢复已完成" : result.status === "rolled_back" ? "已回到操作前的状态" : "已完成已提交恢复的收尾";
  return action + "。\n原件与失败材料保留在：" + result.originals_directory;
}

/** Closed arguments fail before acquiring a Home. The restore inspector comes only from product platform composition. */
export async function runLocalHomeCli(args: string[], inspectCatalog?: HomeRestoreCatalogInspector): Promise<number> {
  if (!args.length || args[0] === "--help" || args[0] === "-h" || ["snapshot", "restore"].includes(args[0]!) && args.length === 2 && args[1] === "--help") {
    printCliLine(usage); return 0;
  }
  const operation = args[0];
  if (operation !== "snapshot" && operation !== "restore") throw homeSnapshotErrors.invalid(`未知 Home 操作: ${operation}`);
  const values = flags(args, operation), home = values.get("--home"), destination = values.get("--to"), source = values.get("--from");
  if (operation === "snapshot" && typeof destination !== "string") throw homeSnapshotErrors.invalid("home snapshot 必须给出 --to 目录");
  if (operation === "restore" && (typeof source === "string") === values.has("--recover")) throw homeRestoreErrors.invalid("home restore 必须且只能选择 --from 目录或 --recover");
  if (operation === "restore" && !inspectCatalog) throw homeRestoreErrors.dependency_unavailable("此入口没有产品目录库的只读检查端口，未开始恢复");
  const abort = new AbortController(), cancelled = () => abort.abort(new Error("Home 离线操作已取消"));
  process.once("SIGINT", cancelled); process.once("SIGTERM", cancelled);
  try {
    const options = { ...(typeof home === "string" ? { homeDirectory: home } : {}), signal: abort.signal };
    if (operation === "snapshot") {
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
