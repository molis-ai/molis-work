import type { ExactRef } from "@prologue/sdk";
import type { AgentWriteCheckNote } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CommandEvent } from "./prologue-node-kit.js";
import type { RunDeps } from "./prologue-run.js";
import { readSdkRunEvents } from "./prologue-run-events.js";

export interface CommandReceiptMatch { event: CommandEvent; root: ExactRef<"authorized-root">; check?: AgentWriteCheckNote }

/** Resolve the requested receipt identities in one pass through the original round. */
export async function matchCommandReceipts({ runtime, index, state }: Pick<RunDeps, "runtime" | "index" | "state">, sessionId: string, runId: string, ids: Set<string>) {
  const saved = await index.read(sessionId);
  if (!saved) throw new Error("会话执行索引不可用");
  const attempts = saved.attempts.filter(entry => entry.run_id === runId && entry.root_ref);
  const attempt = attempts[0];
  if (attempts.length !== 1 || !attempt?.root_ref) throw new Error("找不到这一轮唯一的执行目录");
  const session = await runtime.sessions.open(saved.ref);
  if (!session) throw new Error("SDK 会话不可读");
  const terminalRuns = await session.terminalRuns();
  const isTerminal = terminalRuns.some(run => run.id === runId);
  const cached = isTerminal ? undefined : state.commandEvents?.get(runId);
  const events = cached?.length ? cached : await readSdkRunEvents(session, runId, terminalRuns);
  const checks = new Map(Object.values(attempt.write_checks ?? {}).filter(note => note.write_call_id !== undefined).map(note => [`${note.write_call_id}:diagnostics`, note]));
  const found = new Map<string, CommandReceiptMatch | null>();
  for (const event of events) {
    if (event.type !== "command-receipt" || !ids.has(event.callId)) continue;
    found.set(event.callId, found.has(event.callId) ? null : { event, root: attempt.root_ref, check: checks.get(event.callId) });
  }
  return found;
}
