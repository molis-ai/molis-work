import type { ExactRef, Runtime } from "@prologue/sdk";
import type { AgentWorkGraphPort, AgentWorkNode } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentErrors } from "../errors.js";
import { readyStep } from "./prologue-collaboration.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";

type Node = ReturnType<Runtime["boards"]["get"]>["nodes"][number];

/** The work's own step: its rounds stand on it while the work goes on. */
const ROOT = "work";
/** Finished parts a work's graph keeps: a work hands out at most a few parts, each with a few follow-ups. */
const KEEP_FINISHED = 64;
const ENDED: readonly Node["state"][] = ["succeeded", "failed", "cancelled"];
const boardRef = (id: string) => ({ kind: "task-board", id, revision: 1 }) as ExactRef<"task-board">;

/**
 * A Host work on its own standing graph (specs/prologue-adoption §6.0k): an Assistant Work, the parts it hands to
 * other sessions, and the rounds that stand on them. The work's session holds the root; a part's session holds the
 * part's step. Which graph a session works on is kept in its index; which step a round stands on is the step its
 * session holds there, so neither the work nor the round names a step the graph could disagree with.
 */
export function createWorkGraphs(runtime: Runtime, index: SessionIndexStore) {
  const admitted = new Map<string, Promise<ExactRef<"task-board">>>();
  const graph = (key: string) => {
    let held = admitted.get(key);
    if (!held) {
      held = runtime.boards.admit({ nodes: [], idempotencyKey: `molis-work:${key}`, standing: { keepFinished: KEEP_FINISHED } }).then(one => one.ref);
      admitted.set(key, held);
      held.catch(() => admitted.delete(key));
    }
    return held;
  };
  const sessionOf = async (id: string) => {
    const saved = await index.read(id);
    if (!saved) throw agentErrors.session_unknown("这条会话读不到，不能放到工作的任务图上");
    return saved.ref;
  };
  // A step held by the session already there is the same step; held by another, it is someone else's.
  const place = async (ref: ExactRef<"task-board">, session: ExactRef<"session">, node: { id: string; title: string; parent?: string }) => {
    const there = runtime.boards.get(ref).nodes.find(one => one.id === node.id);
    if (there && (there.assignee?.kind !== "session" || there.assignee.id !== session.id)) throw agentErrors.collaboration_conflict("这一步已经归别的会话");
    if (!there) {
      await runtime.boards.addNode({ ref, expectedVersion: runtime.boards.get(ref).version,
        node: { id: node.id, title: node.title.slice(0, 120) || "工作", dependsOn: [], ...(node.parent ? { parent: node.parent } : {}), onFailure: "block-for-human", assignee: session } });
    }
    await index.update(session.id, saved => { saved.work_graph = ref.id; });
  };
  const view = (node: Node): AgentWorkNode => {
    const last = node.reports.at(-1);
    return { node_id: node.id, ...(node.parent ? { parent: node.parent } : {}), title: node.title, state: node.state,
      ...(node.assignee?.kind === "session" ? { session_id: node.assignee.id } : {}),
      ...(ENDED.includes(node.state) && last?.human ? { ended_by_person: { at: new Date(last.atMs).toISOString(), note: last.note } } : {}) };
  };

  const port: AgentWorkGraphPort = {
    async open(input) {
      const ref = await graph(input.key);
      await place(ref, await sessionOf(input.session_id), { id: ROOT, title: input.title });
      return { graph_id: ref.id };
    },
    async add(input) {
      await place(boardRef(input.graph_id), await sessionOf(input.session_id), { id: input.node_id, title: input.title, parent: input.under ?? ROOT });
    },
    async read(graphId) { return runtime.boards.get(boardRef(graphId)).nodes.map(view); },
    watch(graphId, listener) { return runtime.boards.subscribe(event => { if (event.board === graphId) listener(); }); },
    async end(input) {
      const ref = boardRef(input.graph_id), node = runtime.boards.get(ref).nodes.find(one => one.id === input.node_id);
      if (!node) throw agentErrors.collaboration_unknown("工作的任务图上没有这一步");
      if (ENDED.includes(node.state)) return;
      const holder = node.assignee?.kind === "session" ? node.assignee : undefined;
      await runtime.boards.report({ ref, expectedVersion: runtime.boards.get(ref).version, nodeId: node.id, by: undefined, note: input.note.slice(0, 480), atMs: Date.now(), to: "cancelled",
        ...(input.actor_id ? { human: { kind: "human", id: input.actor_id }, override: true } : holder ? { session: holder } : {}) });
    },
  };

  return {
    port,
    /** Where a round of a session on a work's graph stands: the step it holds there, made ready if it was held for the person. */
    async binding(saved: SessionIndex & { work_graph: string }, session: ExactRef<"session">, actor: string): Promise<{ board: string; node: string }> {
      const held = runtime.boards.assignedTo(session).find(entry => entry.ref.id === saved.work_graph)?.nodes.at(-1);
      if (!held) throw agentErrors.collaboration_unknown("这项工作的任务图上没有这个会话可以接着做的一步");
      await readyStep(runtime, saved.work_graph, held.id, actor);
      return { board: saved.work_graph, node: held.id };
    },
    /** A round on a work's graph ended: a part's step ends the same way; the work's root stays open. */
    ended(run: ExactRef<"run">, session: ExactRef<"session">, type: "completed" | "failed" | "cancelled"): void {
      const at = runtime.boards.attemptOf(run);
      if (!at || at.node === ROOT) return;
      void index.read(session.id).then(async saved => {
        const node = saved?.work_graph === at.board.id ? runtime.boards.get(at.board).nodes.find(one => one.id === at.node) : undefined;
        // A step the person ended meanwhile, or handed on, is not this round's to end.
        if (!node || ENDED.includes(node.state) || node.generation !== at.generation) return;
        await runtime.boards.report({ ref: at.board, expectedVersion: runtime.boards.get(at.board).version, nodeId: at.node, by: undefined, session, atMs: Date.now(),
          note: `这一轮结束：${type}`, to: type === "completed" ? "succeeded" : type, scope: { node: at.node, generation: at.generation } });
      }).catch(() => undefined);
    },
  };
}
