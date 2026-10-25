import { isAbsolute } from "node:path";
import type { MemoryHomeRecoveryRequest, MemoryHomeRecoveryResult } from "@molis-ai/molis-work-contracts/services/memory";
import { printCliJson, printCliLine } from "./protocol.js";

export type CliMemoryRecovery = (input: MemoryHomeRecoveryRequest) => Promise<MemoryHomeRecoveryResult>;

/** Parse one explicit offline maintenance request; all storage and recovery decisions remain with its owner. */
export async function dispatchCliMemoryCommand(args: string[], recover?: CliMemoryRecovery): Promise<number> {
  if (!args.length || args.includes("--help") || args.includes("-h")) {
    printCliLine("molis-work memory recover-home --source-home PATH --target-home PATH --operation-id ID --confirm [--json]\n\n两个路径必须为同一 Home、同一历史的停写完整工作副本，且另有完整备份。source 为较新的 T1；target 为已放回原 Home 绝对路径的 T0 工作副本，命令不重定位项目路径。不会停止服务、复制备份或使用默认 Home；失败后只用原操作号明确重试。");
    return 0;
  }
  if (args[0] !== "recover-home") throw new Error("未知记忆维护命令；请运行 molis-work memory --help");
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 1; index < args.length; index++) {
    const name = args[index]!;
    if (values.has(name) || switches.has(name)) throw new Error(`参数重复: ${name}`);
    if (name === "--confirm" || name === "--json") { switches.add(name); continue; }
    if (!["--source-home", "--target-home", "--operation-id"].includes(name)) throw new Error(`未知参数: ${name}`);
    const value = args[++index];
    if (!value?.trim() || value.startsWith("--")) throw new Error(`参数缺值: ${name}`);
    values.set(name, value);
  }
  const sourceDirectory = values.get("--source-home"), homeDirectory = values.get("--target-home"), operation_id = values.get("--operation-id");
  if (!sourceDirectory || !homeDirectory || !operation_id) throw new Error("必须显式提供 --source-home、--target-home 和 --operation-id");
  if (!isAbsolute(sourceDirectory) || !isAbsolute(homeDirectory)) throw new Error("源副本和目标副本必须使用绝对路径");
  if (!switches.has("--confirm")) throw new Error("尚未执行；确认两个副本已停写且另有完整备份后，使用同一操作号并加 --confirm");
  if (!recover) throw new Error("当前入口未装配停写记忆恢复能力");
  const result = await recover({ sourceDirectory, homeDirectory, operation_id });
  if (switches.has("--json")) printCliJson(result);
  else printCliLine(`记忆恢复已完成${result.replayed ? "（原操作已核对）" : ""}；操作号：${result.operation_id}`);
  return 0;
}
