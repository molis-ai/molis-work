import type { CollaborationHost, ExactRef, Runtime } from "@prologue/sdk";

/**
 * Molis's side of the SDK's collaboration (specs/prologue-adoption §4.6.10): which step of which task graph a round is
 * bound to, and the check the Runtime asks for before each child it dispatches. The graph, its steps, waits and
 * continuations are the SDK's; this file only chooses where a round stands and answers for the Host.
 */

/** Tools a run may use only bound to a step (the SDK's bound-only tools, and `await-commands` for its `park` form). */
export const COLLABORATION_TOOLS: readonly string[] = ["dispatch-subagent", "board-plan", "board-revise", "board-report", "board-wait", "session-send", "session-inject", "await-commands"];

/** The step a session's rounds stand on when they have no confirmed plan; the person and the model never report it. */
export const SESSION_STEP = "session";
/** The step a confirmed plan's rounds stand on; the plan's steps hang under it. */
export const PLAN_STEP = "plan";
/** Finished steps a session's standing board keeps (its subtasks' steps); older ones are let go. */
const SESSION_BOARD_KEEPS = 40;

const boardRef = (id: string) => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">;
const HUMAN_STEP_NOTE = "用户开始了新的一轮";

/** Whether a round with these tools (or a plan) works with others, so it must stand on a step. */
export function collaborates(tools: readonly string[], planned: boolean): boolean {
  return planned || tools.some(tool => COLLABORATION_TOOLS.includes(tool));
}

/**
 * The session's own standing board, admitted once: the key makes every later admit return the same board (the SDK
 * keeps the key with the board across restarts), so nothing about it is stored in the Host's index.
 */
export async function sessionBoard(runtime: Runtime, session: ExactRef<"session">): Promise<ExactRef<"task-board">> {
  const admitted = await runtime.boards.admit({ idempotencyKey: `molis-session-board:${session.id}`, standing: { keepFinished: SESSION_BOARD_KEEPS },
    nodes: [{ id: SESSION_STEP, title: "会话", dependsOn: [], onFailure: "block-for-human", assignee: session }] });
  return admitted.ref;
}

/** A continuation of this session that may go on now, on any of the boards it stands on: the next round takes it up. */
export function eligibleContinuation(runtime: Runtime, session: ExactRef<"session">, boards: readonly ExactRef<"task-board">[]): { board: string; node: string; requestKey: string } | undefined {
  for (const ref of boards) {
    let nodes: ReturnType<Runtime["boards"]["get"]>["nodes"];
    try { nodes = runtime.boards.get(ref).nodes; } catch { continue; }
    for (const node of nodes) {
      const continuation = node.continuation;
      if (continuation?.state === "eligible" && continuation.target.session.id === session.id) return { board: ref.id, node: node.id, requestKey: continuation.requestKey };
    }
  }
  return undefined;
}

/**
 * Make the step a round stands on one it may bind to. A step held for the person (blocked, or needing reconciliation
 * after a restart) goes back to ready: the person starting a round is their decision, recorded as theirs.
 */
export async function readyStep(runtime: Runtime, board: string, node: string, actor: string): Promise<void> {
  const ref = boardRef(board), step = runtime.boards.get(ref).nodes.find(one => one.id === node);
  if (!step) throw new Error("会话的任务图缺少这一步，不能开始");
  if (step.state === "blocked") await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: node, by: undefined, human: { kind: "human", id: actor }, override: true, note: HUMAN_STEP_NOTE, atMs: Date.now(), to: "ready" });
  else if (step.state === "needs-reconciliation") await runtime.boards.transition({ ref, nodeId: node, to: "ready" });
  else if (!["ready", "running", "waiting"].includes(step.state)) throw new Error("会话的任务图已经结束，不能再开始新的一轮");
}

/** What the Host asks of a parent round before its child is let out: the round's own pre-dispatch check (authority, install, cancel). */
export interface DispatchChecks {
  forRun(runId: string): (() => Promise<void>) | undefined;
}

/**
 * The Host's answer to the Runtime before each dispatch: the parent round's own check is run again, so a revoked or
 * disabled caller lets no child out. Roles and directories are checked when the child starts (`verifySubagentStart`),
 * before its first model request. A refusal is a code the Runtime records on the attempt; nothing is dispatched.
 */
export function createCollaborationHost(checks: DispatchChecks): CollaborationHost {
  return {
    async admitDispatch(request) {
      const check = checks.forRun(request.parent.run.id);
      if (!check) return { admit: false, code: "agent.collaboration_not_bound", note: "这一轮没有可用的派出检查" };
      try { await check(); } catch (error) {
        return { admit: false, code: (error as { code?: unknown }).code === undefined ? "agent.dispatch_refused" : String((error as { code: unknown }).code).slice(0, 64),
          note: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
      }
      return { admit: true };
    },
  };
}
