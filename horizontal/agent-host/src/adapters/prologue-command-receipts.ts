import { WORKSPACE_COMMAND_RECEIPT_KIND, type ExactRef, type Runtime } from "@prologue/sdk";
import type { AgentCommandOutput, AgentWriteCheckNote } from "@molis-ai/molis-work-contracts/services/agent-host";
import { readResource, sameRef, type CommandEvent } from "./prologue-node-kit.js";
import type { RunDeps } from "./prologue-run.js";
import type { PrologueRuntimePort } from "./prologue-ports.js";

interface Match { event: CommandEvent; root: ExactRef<"authorized-root">; check?: AgentWriteCheckNote }

/** A single read and a batch verify exactly the same resource, authorized root, command and effect. */
async function readReceipt(runtime: Runtime, runId: string, { event, root, check }: Match): Promise<AgentCommandOutput> {
  const record = await readResource(runtime, event.receiptRef);
  const receipt = record.receipt;
  if (record.kind !== WORKSPACE_COMMAND_RECEIPT_KIND || record.version !== 1 || !sameRef(record.rootRef, root)
    || typeof record.executable !== "string" || !Array.isArray(record.argv) || !record.argv.every((arg: unknown) => typeof arg === "string")
    || !receipt || receipt.commandId !== event.commandId || !sameRef(receipt.effectRef, event.effectRef)
    || typeof receipt.stdout !== "string" || typeof receipt.stderr !== "string" || typeof receipt.truncated !== "boolean"
    || typeof receipt.timedOut !== "boolean" || typeof receipt.cancelled !== "boolean"
    || receipt.exitCode !== undefined && !Number.isInteger(receipt.exitCode)
    || receipt.stopReason !== undefined && !["cancelled", "timed-out"].includes(receipt.stopReason)) throw new Error("命令回执与这轮执行不一致，不能展示为已确认结果");
  return { ref: { run_id: runId, call_id: event.callId }, command: [record.executable, ...record.argv.map((arg: string) => JSON.stringify(arg))].join(" "),
    exit_code: receipt.exitCode ?? null, stdout: receipt.stdout, stderr: receipt.stderr, truncated: receipt.truncated,
    timed_out: receipt.timedOut, cancelled: receipt.cancelled, ...(receipt.stopReason ? { stop_reason: receipt.stopReason } : {}),
    ...(check ? { after_write_check: { checker_id: check.checker_id, display_name: check.display_name, version: check.version } } : {}) };
}

export function commandReceipts({ runtime, index, state }: Pick<RunDeps, "runtime" | "index" | "state">):
  Required<Pick<PrologueRuntimePort, "readCommandOutput" | "readWriteChecks">> {
  async function matches(sessionId: string, runId: string, ids: Set<string>) {
    const saved = await index.read(sessionId);
    if (!saved) throw new Error("会话执行索引不可用");
    const attempts = saved.attempts.filter(entry => entry.run_id === runId && entry.root_ref);
    const attempt = attempts[0];
    if (attempts.length !== 1 || !attempt?.root_ref) throw new Error("找不到这一轮唯一的执行目录");
    const session = await runtime.sessions.open(saved.ref);
    if (!session) throw new Error("SDK 会话不可读");
    const terminal = (await session.terminalRuns()).find(run => run.id === runId);
    const events = terminal ? await session.replay(terminal) : state.commandEvents.get(runId) ?? [];
    const checks = new Map(Object.values(attempt.write_checks ?? {}).filter(note => note.write_call_id !== undefined).map(note => [`${note.write_call_id}:diagnostics`, note]));
    const found = new Map<string, Match | null>();
    for (const event of events) {
      if (event.type !== "command-receipt" || !ids.has(event.callId)) continue;
      found.set(event.callId, found.has(event.callId) ? null : { event, root: attempt.root_ref, check: checks.get(event.callId) });
    }
    return found;
  }
  return {
    async readCommandOutput(sessionId, ref) {
      const match = (await matches(sessionId, ref.run_id, new Set([ref.call_id]))).get(ref.call_id);
      if (!match) throw new Error(match === null ? "命令引用对应多次执行" : "没有这次命令的持久回执；结果未知，不能当作成功或自动重跑");
      return readReceipt(runtime, ref.run_id, match);
    },
    async readWriteChecks(sessionId, runId, writeIds) {
      const found = await matches(sessionId, runId, new Set(writeIds.map(id => `${id}:diagnostics`)));
      const results = [];
      for (const call_id of writeIds) {
        const match = found.get(`${call_id}:diagnostics`);
        if (!match) continue;
        const receipt = await readReceipt(runtime, runId, match).catch(() => undefined);
        if (receipt) results.push({ call_id, checker: receipt.after_write_check?.display_name ?? null,
          version: receipt.after_write_check?.version ?? null, exit_code: receipt.exit_code,
          timed_out: receipt.timed_out === true || receipt.stop_reason === "timed-out",
          cancelled: receipt.cancelled === true || receipt.stop_reason === "cancelled" });
      }
      return results;
    },
  };
}
