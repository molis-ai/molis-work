import type { CollaborationHost, ExactRef, Runtime } from "@prologue/sdk";

/**
 * Molis's side of the SDK's collaboration (specs/prologue-adoption §4.6.10): which step of which task graph a round is
 * bound to, and the check the Runtime asks for before each child it dispatches. The graph, its steps, waits and
 * continuations are the SDK's; this file only chooses where a round stands and answers for the Host.
 */

/** Tools a run may use only bound to a step (the SDK's bound-only tools, and `await-commands` for its `park` form). */
export const COLLABORATION_TOOLS: readonly string[] = ["dispatch-subagent", "board-plan", "board-revise", "board-report", "board-wait", "session-send", "session-inject", "await-commands"];

/** The project's root on its work board: every session's block hangs under it, so the blocks are siblings (P2g). */
export const PROJECT_STEP = "project";
/** A session's block on the project's board: its rounds stand on it; its plans' steps and its subtasks' steps hang under it. */
export const blockId = (session: { readonly id: string }) => `s-${session.id}`;
export const isBlock = (id: string) => /^s-[^.]+$/.test(id);
/**
 * A plan's own step in the session's block: its steps hang under it, not under the block, so a step handed to another
 * session is not next to the block (a letter from the block to that session would otherwise find two of its steps there,
 * its block and the handed step, and go nowhere: P2g).
 */
export const isPlanStep = (id: string) => /^s-[^.]+\.p\d+$/.test(id);

const boardRef = (id: string) => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">;
const HUMAN_STEP_NOTE = "用户开始了新的一轮";

/** Whether a round with these tools (or a plan) works with others, so it must stand on a step. */
export function collaborates(tools: readonly string[], planned: boolean): boolean {
  return planned || tools.some(tool => COLLABORATION_TOOLS.includes(tool));
}

/**
 * The session's block on the project's work board (the user's B, 2026-10-14): the project's root is put on the board the
 * first time it is needed, and the session's block under it, held by the session. A board starts empty (it holds the
 * project's work under way), so both are added, not admitted; adding a step that hangs under the root compares nothing
 * else on the board (P2k), and two sessions adding theirs at once both land.
 */
export async function sessionBlock(runtime: Runtime, board: ExactRef<"task-board">, session: ExactRef<"session">, title: string): Promise<string> {
  const block = blockId(session);
  const ensure = async (id: string, node: Parameters<Runtime["boards"]["addNode"]>[0]["node"]) => {
    if (runtime.boards.get(board).nodes.some(one => one.id === id)) return;
    await runtime.boards.addNode({ ref: board, expectedVersion: runtime.boards.get(board).version, node }).catch((error: unknown) => {
      // Another round put it there first.
      if (!runtime.boards.get(board).nodes.some(one => one.id === id)) throw error;
    });
  };
  await ensure(PROJECT_STEP, { id: PROJECT_STEP, title: "项目", dependsOn: [], onFailure: "block-for-human" });
  await ensure(block, { id: block, title: title.slice(0, 120) || "会话", dependsOn: [], parent: PROJECT_STEP, onFailure: "block-for-human", assignee: session });
  return block;
}

/** The prefix of a new plan's steps in the session's block: the plan's number in the session. */
export const planPrefix = (block: string, nth: number) => `${block}.p${nth}`;

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
 * after a restart) goes back to ready: the person starting a round, or giving up the wait that held it, is their
 * decision, recorded as theirs.
 */
export async function readyStep(runtime: Runtime, board: string, node: string, actor: string, note = HUMAN_STEP_NOTE): Promise<void> {
  const ref = boardRef(board), step = runtime.boards.get(ref).nodes.find(one => one.id === node);
  if (!step) throw new Error("会话的任务图缺少这一步，不能开始");
  if (step.state === "blocked") await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: node, by: undefined, human: { kind: "human", id: actor }, override: true, note, atMs: Date.now(), to: "ready" });
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
