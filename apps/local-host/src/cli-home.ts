import { printCliJson, printCliLine } from "@molis-ai/molis-work-app-cli";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHomeSnapshot } from "./home-snapshot.js";
import { homeSnapshotErrors } from "./home-store-snapshot.js";

/** Closed argument shape: typos and duplicate flags fail before acquiring a Home or creating output. */
export async function runLocalHomeCli(args: string[]): Promise<number> {
  if (!args.length || args[0] === "--help" || args[0] === "-h" || args[0] === "snapshot" && args.length === 2 && args[1] === "--help") {
    printCliLine("molis-work home snapshot --to DIRECTORY [--home PATH] [--json]\n\n停止使用该 Home 的宿主后，在同一 Home 的离线窗口生成快照。目标必须是 Home 外尚不存在的目录；原密钥不会导出，恢复限原 Home 路径。");
    return 0;
  }
  if (args[0] !== "snapshot") throw homeSnapshotErrors.invalid(`未知 Home 操作: ${args[0]}`);
  const values = new Map<string, string | true>();
  for (let at = 1; at < args.length; at += 1) {
    const name = args[at]!;
    if (!["--home", "--to", "--json"].includes(name) || values.has(name)) throw homeSnapshotErrors.invalid(`未知或重复的参数: ${name}`);
    if (name === "--json") values.set(name, true);
    else {
      const value = args[++at];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--")) throw homeSnapshotErrors.invalid(`${name} 必须给出非空路径`);
      values.set(name, value);
    }
  }
  const destination = values.get("--to");
  if (typeof destination !== "string") throw homeSnapshotErrors.invalid("home snapshot 必须给出 --to 目录");
  const home = values.get("--home"), abort = new AbortController();
  const cancelled = () => abort.abort(new Error("快照已取消，未发布的私有暂存将清理"));
  process.once("SIGINT", cancelled); process.once("SIGTERM", cancelled);
  try {
    const result = await createHomeSnapshot({ destination, ...(typeof home === "string" ? { homeDirectory: home } : {}), signal: abort.signal });
    if (values.has("--json")) printCliJson(result);
    else printCliLine(`快照已保存：${result.snapshot_directory}\n${result.stores} 项登记，${result.databases} 个实际 SQLite 库。原密钥不在快照内，请保留同 Home 原依赖。`);
    return 0;
  } catch (error) {
    if (!values.has("--json") || !(error instanceof ActionError)) throw error;
    process.stderr.write(JSON.stringify({ error: { code: error.code, kind: error.kind, message: error.message } }) + "\n");
    return 1;
  } finally { process.off("SIGINT", cancelled); process.off("SIGTERM", cancelled); }
}
