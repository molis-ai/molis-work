import { posix } from "node:path";
import type { PackTool, ToolRunner } from "@prologue/sdk";
import type { AgentWriteCheckNote, AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * The after-write check of a Coding round (specs/prologue-adoption §6.0p): after each write or edit lands, the SDK asks this
 * executor which command checks the file, and it answers with the first of the person's checkers that applies, or why
 * nothing is checked. It runs nothing: the SDK checks the answer and runs the command through the same review, effect chain
 * and receipt as any other command, under the key it gives (`afterWriteCheck.operationKey`).
 *
 * The command comes only from what the person saved in Coding's settings, read at this moment, for the workspace the
 * project authorizes now; the file is the path from the SDK's write receipt, as one whole argument. Nothing the model
 * writes, and nothing in the repository, shapes it.
 */

/** The executor's name in the round's pack; each session provides its own. */
export const AFTER_WRITE_EXECUTOR = "molis.after-write-check";
/** At most this many checks in one round (§6.0p.3); the next round counts from zero. */
export const CHECKS_PER_ROUND = 10;
const FILE = "{file}";

/**
 * The tool a round's pack marks as its after-write check. A catalog name has one owner, so it is named after the pack;
 * it is optional (a round without checkers gives no executor, and nothing is asked) and never offered to the model.
 */
export function afterWriteTool(scope: string): PackTool {
  return { executor: AFTER_WRITE_EXECUTOR, optional: true, afterWriteCheck: true, registration: {
    name: `molis-after-write-${scope}`, version: "1", description: "The person's after-write check for a file just written: answers with the command to run, which the SDK reviews and runs; nothing runs here.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
    effectKind: "safe-read", gate: "broker", timeoutMs: 10_000, idempotency: "none" } };
}

/** One Coding round's after-write checks. */
export interface AfterWriteRound {
  readonly projectId: string;
  /** The round's authorized directory. */
  readonly rootPath: string;
  /** The project's workspace at this directory, authorized with its real path verified now; none when it is not (any more). */
  workspaceAt(projectId: string, path: string): Promise<string | undefined>;
  readonly store: AgentWriteCheckerStore;
  /** The round's own check before anything leaves for it (its plugin instance, its Character); absent for a trusted Host start. */
  readonly beforeDispatch?: () => void | Promise<void>;
  /** Keeps which checker answered, under the SDK's key for this check, before the command goes up for review; nothing is kept for a `signal` that has aborted by the time it is written. */
  note(operationKey: string, note: AgentWriteCheckNote, signal?: AbortSignal): Promise<void>;
}

/** Whether a checker whose commands run in `cwd` checks this path: a checker checks only files in its own directory. */
const inside = (cwd: string, path: string) => cwd === "." || path.startsWith(`${cwd}/`);

/**
 * The round's executor. A reason it gives is written into the write's observation by the SDK as `not checked: <reason>`;
 * a call the SDK did not make (no `afterWriteCheck`) is refused, as the tool is not offered to the model.
 */
export function afterWriteExecutor(round: AfterWriteRound): ToolRunner {
  let checks = 0;
  return async (call) => {
    const about = call.afterWriteCheck;
    if (!about) throw new Error("写后检查只由 SDK 在写入之后发起");
    const unchecked = (why: string) => JSON.stringify({ unchecked: why });
    if (checks >= CHECKS_PER_ROUND) return unchecked(`这一轮已检查 ${CHECKS_PER_ROUND} 次`);
    try { await round.beforeDispatch?.(); } catch { return unchecked("这一轮的授权已收回"); }
    const workspace = await round.workspaceAt(round.projectId, round.rootPath);
    if (!workspace) return unchecked("工作区授权已撤回");
    const path = String(call.args.path), extension = posix.extname(path);
    const { version, checkers } = await round.store.read(round.projectId, workspace);
    const checker = checkers.find(each => each.applies_to.includes(extension) && inside(each.cwd, path));
    if (!checker) return unchecked(`没有适用于 ${extension || "无扩展名文件"} 的检查器`);
    // Relative to where the command runs, and never read as an option (`-rf.js` is `./-rf.js`).
    const relative = checker.cwd === "." ? path : posix.relative(checker.cwd, path), file = relative.startsWith("-") ? `./${relative}` : relative;
    // Stopped or given up on by now: nothing is kept, and the SDK does not use this answer.
    call.signal?.throwIfAborted();
    await round.note(about.operationKey, { checker_id: checker.checker_id, display_name: checker.display_name, version, ...(about.writeCallId ? { write_call_id: about.writeCallId } : {}) }, call.signal);
    checks += 1;
    return JSON.stringify({ command: { executable: checker.executable, argv: checker.args.map(arg => arg === FILE ? file : arg), cwd: checker.cwd, timeoutMs: checker.timeout_ms } });
  };
}
